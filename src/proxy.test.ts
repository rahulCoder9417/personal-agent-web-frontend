import { NextRequest, type NextFetchEvent } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Which pages can be opened without a session, and where the proxy sends people. Clerk's route
// matcher is the real one; its middleware is a stand-in that records whether the page asked for a
// session and answers `auth()` with the session the test sets.

const env = vi.hoisted(() => ({ mode: "clerk" as "demo" | "dev-token" | "clerk" }));
const clerk = vi.hoisted(() => ({ ran: 0, protectedPaths: [] as string[], options: undefined as unknown, userId: null as string | null }));

// The key Clerk would be handed, set before the proxy is loaded (it reads the environment once).
vi.hoisted(() => {
  process.env.CLERK_JWT_KEY = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg\n-----END PUBLIC KEY-----";
});

vi.mock("@/lib/env", () => ({ authMode: () => env.mode }));
vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  type Auth = (() => Promise<{ userId: string | null }>) & { protect: () => Promise<void> };
  type Handler = (auth: Auth, request: NextRequest) => Promise<Response | void>;
  return {
    createRouteMatcher: actual.createRouteMatcher,
    clerkMiddleware: (handler: Handler, options: unknown) => {
      clerk.options = options;
      return async (request: NextRequest) => {
        clerk.ran += 1;
        const auth = Object.assign(async () => ({ userId: clerk.userId }), {
          protect: async () => void clerk.protectedPaths.push(request.nextUrl.pathname),
        });
        return (await handler(auth, request)) ?? new Response(null, { status: 200 });
      };
    },
  };
});

import proxy, { clerkOptions, config } from "./proxy";

const event = {} as NextFetchEvent;
const visit = (path: string, headers?: Record<string, string>) => proxy(new NextRequest(`https://app.textcrew.in${path}`, { headers }), event);
const open = async (path: string) => {
  await visit(path);
  return !clerk.protectedPaths.includes(new URL(path, "https://app.textcrew.in").pathname);
};

afterAll(() => {
  delete process.env.CLERK_JWT_KEY;
});

beforeEach(() => {
  env.mode = "clerk";
  clerk.ran = 0;
  clerk.protectedPaths = [];
  clerk.userId = null;
});

describe("sign-in proxy", () => {
  it("lets someone without a session reach the sign-in pages", async () => {
    expect(await open("/sign-in")).toBe(true);
    expect(await open("/sign-up")).toBe(true);
    expect(await open("/sso-callback")).toBe(true);
    // With the page to land on afterwards, as the proxy itself adds it.
    expect(await open("/sign-in?redirect_url=https%3A%2F%2Fapp.textcrew.in%2Fapps")).toBe(true);
    expect(await open("/sso-callback?redirect_url=%2Fapps")).toBe(true);
  });

  it("keeps the pages that were open before open", async () => {
    expect(await open("/connected")).toBe(true);
    expect(await open("/billing?checkout=done")).toBe(true);
    // API routes answer 401 themselves.
    expect(await open("/api/v1/me")).toBe(true);
    expect(await open("/api/health")).toBe(true);
  });

  it("asks for a session everywhere else", async () => {
    for (const path of ["/", "/approvals", "/integrations", "/integrations/apps", "/integrations/mcp", "/apps", "/apps/mcp", "/settings", "/settings/plans", "/onboarding", "/more", "/crew", "/activity"]) {
      expect(await open(path), path).toBe(false);
    }
  });

  it("opens nothing next to or under the sign-in pages", async () => {
    for (const path of ["/sign-in/anything", "/sign-up/anything", "/sso-callback/anything", "/sign-ins", "/sign-up-later", "/sso", "/billing/history", "/connected/apps", "/api"]) {
      expect(await open(path), path).toBe(false);
    }
  });

  it("shows the sign-in pages to someone without a session", async () => {
    for (const path of ["/sign-in", "/sign-up?redirect_url=%2Fapps"]) {
      const response = await visit(path);
      expect(response?.headers.get("location"), path).toBeNull();
    }
  });

  it("sends someone already signed in from the sign-in pages to the page they came for", async () => {
    clerk.userId = "user_1";
    const landing = async (path: string, headers?: Record<string, string>) => {
      const response = await visit(path, headers);
      expect(response?.status, path).toBe(307);
      return response?.headers.get("location");
    };
    expect(await landing("/sign-in")).toBe("https://app.textcrew.in/");
    expect(await landing("/sign-in?redirect_url=https%3A%2F%2Fapp.textcrew.in%2Fapps%3Fconnected%3Dgithub")).toBe("https://app.textcrew.in/apps?connected=github");
    expect(await landing("/sign-up?redirect_url=%2Fsettings%2Fplans")).toBe("https://app.textcrew.in/settings/plans");
    // Never to another site, and never back to a sign-in page.
    expect(await landing("/sign-in?redirect_url=https%3A%2F%2Fevil.example%2F")).toBe("https://app.textcrew.in/");
    expect(await landing("/sign-up?redirect_url=%2Fsign-in")).toBe("https://app.textcrew.in/");
    // Behind Caddy, the address the browser used.
    expect(await landing("/sign-in?redirect_url=%2Fcrew", { "x-forwarded-host": "app.example.org", "x-forwarded-proto": "https" })).toBe("https://app.example.org/crew");
  });

  it("lets someone signed in finish on the Google callback", async () => {
    clerk.userId = "user_1";
    const response = await visit("/sso-callback?redirect_url=%2Fapps");
    expect(response?.headers.get("location")).toBeNull();
  });

  it("sends someone without a session to this app's own sign-in page, not to Clerk's", () => {
    expect(clerk.options).toMatchObject({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });
  });

  it("hands Clerk the JWT public key when CLERK_JWT_KEY is set, so tokens are checked without calling Clerk", () => {
    expect(clerk.options).toEqual(clerkOptions(process.env));
    expect(clerk.options).toMatchObject({ jwtKey: process.env.CLERK_JWT_KEY });
    expect(clerkOptions({ CLERK_JWT_KEY: "  pem  " })).toEqual({ signInUrl: "/sign-in", signUpUrl: "/sign-up", jwtKey: "pem" });
    // Not set, or empty: Clerk fetches its keys as before.
    expect(clerkOptions({})).toEqual({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });
    expect(clerkOptions({ CLERK_JWT_KEY: " " })).toEqual({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });
  });

  it("checks nothing when Clerk isn't in use", async () => {
    for (const mode of ["demo", "dev-token"] as const) {
      env.mode = mode;
      const response = await visit("/settings");
      expect(response?.headers.get("x-middleware-next")).toBe("1");
    }
    expect(clerk.ran).toBe(0);
    expect(clerk.protectedPaths).toEqual([]);
  });

  it("leads home from the sign-in pages when there are no accounts", async () => {
    for (const mode of ["demo", "dev-token"] as const) {
      env.mode = mode;
      for (const path of ["/sign-in", "/sign-up?redirect_url=%2Fapps", "/sso-callback"]) {
        const response = await visit(path);
        expect(response?.status, `${mode} ${path}`).toBe(307);
        expect(response?.headers.get("location"), `${mode} ${path}`).toBe("https://app.textcrew.in/");
      }
    }
    expect(clerk.ran).toBe(0);
  });

  it("runs on pages and API routes, and skips static files", () => {
    const [pages, api] = config.matcher.map((pattern) => new RegExp(`^${pattern}$`));
    for (const path of ["/", "/sign-in", "/sign-up", "/sso-callback", "/settings/plans"]) expect(pages.test(path), path).toBe(true);
    for (const path of ["/_next/static/chunk.js", "/icons/icon-192.png", "/manifest.webmanifest", "/favicon.ico"]) expect(pages.test(path), path).toBe(false);
    expect(api.test("/api/v1/me")).toBe(true);
  });
});
