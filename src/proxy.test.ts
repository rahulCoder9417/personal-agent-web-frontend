import { NextRequest, type NextFetchEvent } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Which pages can be opened without a session. Clerk's route matcher is the real one; its
// middleware is a stand-in that only records whether the page asked for a session.

const env = vi.hoisted(() => ({ mode: "clerk" as "demo" | "dev-token" | "clerk" }));
const clerk = vi.hoisted(() => ({ ran: 0, protectedPaths: [] as string[], options: undefined as unknown }));

vi.mock("@/lib/env", () => ({ authMode: () => env.mode }));
vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  type Handler = (auth: { protect: () => Promise<void> }, request: NextRequest) => Promise<void>;
  return {
    createRouteMatcher: actual.createRouteMatcher,
    clerkMiddleware: (handler: Handler, options: unknown) => {
      clerk.options = options;
      return async (request: NextRequest) => {
        clerk.ran += 1;
        await handler({ protect: async () => void clerk.protectedPaths.push(request.nextUrl.pathname) }, request);
        return new Response(null, { status: 200 });
      };
    },
  };
});

import proxy, { config } from "./proxy";

const event = {} as NextFetchEvent;
const open = async (path: string) => {
  await proxy(new NextRequest(`https://app.textcrew.in${path}`), event);
  return !clerk.protectedPaths.includes(new URL(path, "https://app.textcrew.in").pathname);
};

beforeEach(() => {
  env.mode = "clerk";
  clerk.ran = 0;
  clerk.protectedPaths = [];
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
    for (const path of ["/", "/approvals", "/apps", "/apps/mcp", "/settings", "/settings/plans", "/onboarding", "/more", "/crew", "/activity"]) {
      expect(await open(path), path).toBe(false);
    }
  });

  it("opens nothing next to or under the sign-in pages", async () => {
    for (const path of ["/sign-in/anything", "/sign-up/anything", "/sso-callback/anything", "/sign-ins", "/sign-up-later", "/sso", "/billing/history", "/connected/apps", "/api"]) {
      expect(await open(path), path).toBe(false);
    }
  });

  it("sends someone without a session to this app's own sign-in page, not to Clerk's", () => {
    expect(clerk.options).toEqual({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });
  });

  it("checks nothing when Clerk isn't in use", async () => {
    for (const mode of ["demo", "dev-token"] as const) {
      env.mode = mode;
      const response = await proxy(new NextRequest("https://app.textcrew.in/settings"), event);
      expect(response?.headers.get("x-middleware-next")).toBe("1");
    }
    expect(clerk.ran).toBe(0);
    expect(clerk.protectedPaths).toEqual([]);
  });

  it("runs on pages and API routes, and skips static files", () => {
    const [pages, api] = config.matcher.map((pattern) => new RegExp(`^${pattern}$`));
    for (const path of ["/", "/sign-in", "/sign-up", "/sso-callback", "/settings/plans"]) expect(pages.test(path), path).toBe(true);
    for (const path of ["/_next/static/chunk.js", "/icons/icon-192.png", "/manifest.webmanifest", "/favicon.ico"]) expect(pages.test(path), path).toBe(false);
    expect(api.test("/api/v1/me")).toBe(true);
  });
});
