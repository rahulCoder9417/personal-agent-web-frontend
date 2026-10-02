import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import {
  FORWARDED_REQUEST_HEADERS,
  FORWARDED_RESPONSE_HEADERS,
  resolveUpstream,
} from "@/lib/api/proxy-target";
import { handleDemoRequest } from "@/lib/demo";
import { apiBaseUrl, authMode, devToken } from "@/lib/env";

// The browser only ever talks to this route. It adds the session token on the server,
// so the token never sits in page JavaScript or in an EventSource URL.

export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

async function clerkToken(): Promise<string | null> {
  const { userId, getToken } = await auth();
  return userId ? getToken() : null;
}

async function handle(request: NextRequest, ctx: RouteContext<"/api/v1/[...path]">): Promise<Response> {
  const { path } = await ctx.params;
  const target = resolveUpstream(apiBaseUrl(), path, request.nextUrl.search);
  if (!target) return errorResponse(404, "not_found", "Not found");

  const mode = authMode();
  if (mode === "demo") return handleDemoRequest(request, path);

  const token = mode === "dev-token" ? devToken() : await clerkToken();
  if (!token) return errorResponse(401, "unauthorized", "Sign in to continue");

  const headers = new Headers({ authorization: `Bearer ${token}` });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Streams the upload (attachments) instead of buffering it.
      ...(hasBody ? { duplex: "half" } : {}),
      signal: request.signal,
      cache: "no-store",
      redirect: "manual",
    } as RequestInit);
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("[proxy] backend unreachable:", error instanceof Error ? error.message : error);
    return errorResponse(502, "upstream_unavailable", "Can't reach Textcrew right now. Try again in a moment.");
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
    responseHeaders.set("cache-control", "no-cache, no-transform");
    responseHeaders.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
