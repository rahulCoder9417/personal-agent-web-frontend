// The demo backend: an in-memory account that answers the same /v1 endpoints as the real API,
// so the whole app can be used with no backend and no sign-in. See `seed.ts` for what's in it.

import { expireApprovals } from "./handlers-chat";
import { errorResponse, HttpError, notFound } from "./http";
import { matchRoute } from "./routes";
import { getStore } from "./store";

export { resetDemoStore } from "./store";

/** Answers one proxied request. `segments` is the path after `/v1`, e.g. `["approvals", "ap_1", "decision"]`. */
export async function handleDemoRequest(request: Request, segments: string[]): Promise<Response> {
  const match = matchRoute(request.method, segments);
  if (!match) return errorResponse(notFound());

  const state = getStore();
  try {
    expireApprovals(state);
    return await match.handler({ request, url: new URL(request.url), params: match.params, state });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error("[demo]", error);
    return errorResponse(new HttpError(500, "internal", "Something went wrong. Try again."));
  }
}
