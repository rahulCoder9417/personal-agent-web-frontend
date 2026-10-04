// Decides which backend URL a proxied request may reach. Kept free of Next.js imports so it can be unit tested.

/** First path segment after /v1 that the app is allowed to call. Admin, waitlist and webhooks are not. */
export const ALLOWED_RESOURCES: ReadonlySet<string> = new Set([
  "me",
  "channels",
  "messages",
  "attachments",
  "stream",
  "approvals",
  "apps",
  "connections",
  "mcp-servers",
  "byok",
  "automations",
  "pr-reviews",
  "agent",
  "crew",
  "billing",
  "credits",
  "usage",
  "coupons",
  "activity",
]);

/** Query parameters the browser may not set: the proxy adds the session token itself. */
const BLOCKED_QUERY = ["token"];

function safeSegment(segment: string): boolean {
  return segment.length > 0 && segment !== "." && segment !== ".." && !/[\/\\\s?#]/.test(segment);
}

/**
 * Maps `/api/v1/<segments>` to the backend's `/v1/<segments>`.
 * Returns null when the path isn't one the app should reach.
 */
export function resolveUpstream(baseUrl: string, segments: readonly string[], search = ""): URL | null {
  if (segments.length === 0 || !segments.every(safeSegment)) return null;
  if (!ALLOWED_RESOURCES.has(segments[0])) return null;

  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/v1/${segments.map(encodeURIComponent).join("/")}`);
  const params = new URLSearchParams(search);
  for (const name of BLOCKED_QUERY) params.delete(name);
  url.search = params.toString();
  return url;
}

/** Request headers worth forwarding. Cookies and the browser's own authorization never go upstream. */
export const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "last-event-id", "accept-language"] as const;

/** Response headers passed back to the browser. */
export const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "cache-control"] as const;
