import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real (non-demo) path of the proxy, against a local stand-in for the backend.

const session = vi.hoisted(() => ({ userId: "user_1" as string | null, token: "session-jwt" as string | null }));
const env = vi.hoisted(() => ({ apiUrl: "", mode: "clerk" as "demo" | "dev-token" | "clerk", devToken: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, getToken: async () => session.token }),
}));
vi.mock("@/lib/env", () => ({ apiBaseUrl: () => env.apiUrl, authMode: () => env.mode, devToken: () => env.devToken }));

import { DELETE, GET, POST } from "./route";

type Seen = { method?: string; url?: string; headers: IncomingMessage["headers"]; body: string };
let seen: Seen[] = [];
let backend: Server;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body));
  });
}

beforeAll(async () => {
  backend = createServer(async (request, response) => {
    seen.push({ method: request.method, url: request.url, headers: request.headers, body: await readBody(request) });
    if (request.url?.startsWith("/v1/stream")) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end("event: ready\ndata: {}\n\n");
    } else if (request.url === "/v1/messages" && request.method === "POST") {
      response.writeHead(402, { "content-type": "application/json", "set-cookie": "upstream=1" });
      response.end(JSON.stringify({ error: { code: "out_of_credits", message: "Balance is zero" } }));
    } else if (request.method === "DELETE") {
      response.writeHead(204).end();
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "user_1" }));
    }
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  env.apiUrl = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => void backend.close(() => resolve())));

beforeEach(() => {
  seen = [];
  session.userId = "user_1";
  session.token = "session-jwt";
  env.mode = "clerk";
  env.devToken = null;
});

function call(handler: typeof GET, path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  const request = new NextRequest(`http://localhost:3100/api/v1/${path}`, init);
  const segments = path.split("?")[0].split("/");
  return handler(request, { params: Promise.resolve({ path: segments }) });
}

describe("API proxy", () => {
  it("forwards to the backend with the session token and without the browser's cookies", async () => {
    const response = await call(GET, "me?token=stolen", { headers: { cookie: "__session=abc", authorization: "Bearer from-page" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "user_1" });
    expect(seen[0].url).toBe("/v1/me");
    expect(seen[0].headers.authorization).toBe("Bearer session-jwt");
    expect(seen[0].headers.cookie).toBeUndefined();
  });

  it("passes the body through and hands back the backend's error as is", async () => {
    const response = await call(POST, "messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", clientMessageId: "c1" }),
    });
    expect(response.status).toBe(402);
    expect((await response.json()).error.code).toBe("out_of_credits");
    expect(JSON.parse(seen[0].body)).toEqual({ text: "hi", clientMessageId: "c1" });
    expect(seen[0].headers["content-type"]).toBe("application/json");
    // The backend's cookies are not the browser's business.
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps an event stream unbuffered", async () => {
    const response = await call(GET, "stream");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    expect(await response.text()).toContain("event: ready");
  });

  it("relays an empty answer", async () => {
    const response = await call(DELETE, "automations/au_1", { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(seen[0].method).toBe("DELETE");
  });

  it("answers 401 without a session and never calls the backend", async () => {
    session.userId = null;
    const response = await call(GET, "me");
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
    expect(seen).toHaveLength(0);
  });

  it("uses the development token instead of Clerk when one is configured", async () => {
    env.mode = "dev-token";
    env.devToken = "local-dev-jwt";
    session.userId = null;
    const response = await call(GET, "me");
    expect(response.status).toBe(200);
    expect(seen[0].headers.authorization).toBe("Bearer local-dev-jwt");
  });

  it("refuses paths outside the allowlist before anything else", async () => {
    const response = await call(GET, "admin/coupons");
    expect(response.status).toBe(404);
    expect(seen).toHaveLength(0);
  });

  it("answers 502 when the backend is down", async () => {
    const working = env.apiUrl;
    env.apiUrl = "http://127.0.0.1:9";
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await call(GET, "me");
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("upstream_unavailable");
    } finally {
      quiet.mockRestore();
      env.apiUrl = working;
    }
  });
});
