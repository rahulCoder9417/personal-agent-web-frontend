// Waking Tex's workspace before the message: when the chat opens and when the person starts typing,
// the app asks the backend to wake it (`POST /v1/agent/prewarm`), so the first message after a
// few quiet minutes doesn't wait 2.5 to 3.5 seconds for the wake. The backend decides whether to
// wake (not when it is already awake, out of credits, with no AI connected, or paused) and allows
// one a minute; the app asks at most once a minute too, and never shows anything for it.

import { api } from "./api/client";

/** The app asks at most this often. */
export const PREWARM_EVERY_MS = 60_000;

/**
 * A prewarm that asks at most once per `everyMs`, whoever calls it. It never fails and never
 * waits: what the backend answers doesn't matter here. True when it asked.
 */
export function createPrewarm(send: () => Promise<unknown>, now: () => number = () => Date.now(), everyMs = PREWARM_EVERY_MS) {
  let last: number | null = null;
  return (): boolean => {
    const at = now();
    if (last !== null && at - last < everyMs) return false;
    last = at;
    try {
      send().catch(() => {});
    } catch {
      // Nothing to do: the message wakes the workspace as before.
    }
    return true;
  };
}

/** The app's one prewarm: the chat opening and the first keystrokes share its minute. */
export const prewarm = createPrewarm(() => api.POST("/v1/agent/prewarm"));

/** The person started typing: the box was empty and now has something in it. */
export function startsTyping(before: string, after: string): boolean {
  return before.trim() === "" && after.trim() !== "";
}
