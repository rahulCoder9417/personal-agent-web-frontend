// What the person is told when a draft is saved, or when saving it is refused. Saving happens in two
// places (the draft's card in the chat, and its page), so the words live here once.

import { ApiError, type AutomationDraft, type AutomationDraftSaved } from "./api/client";
import { automationHref, draftFirstRun } from "./automation-flow";
import { PRICING_PATH } from "./pricing";

export type SaveNotice = {
  /** `done`: a confirmation; `error`: a failure; `none`: nothing to say (the card shows it). */
  kind: "done" | "error" | "none";
  title: string;
  body?: string;
  action?: { label: string; href: string };
};

/** The confirmation after a save: what was made, when it first runs, and the way to it. */
export function savedNotice(draft: Pick<AutomationDraft, "title" | "kind" | "nextRunAt">, saved: AutomationDraftSaved, now = new Date()): SaveNotice {
  const paused = !saved.automation.enabled;
  return {
    kind: "done",
    title: paused ? `Saved “${draft.title}”, paused` : `Saved “${draft.title}”`,
    body: paused ? "It won’t run until you turn it on." : (draftFirstRun(saved.draft, now) ?? "It runs from now on."),
    action: { label: "Open", href: automationHref(saved.automation.id) },
  };
}

/**
 * What a refused save says. 409: the draft isn't open any more; its card or page is asked for again
 * and shows why, so only "already saved" gets a quiet line, with the way to the automation. A full
 * plan is a failure with "See plans". Anything else is a failure in the API's own words (a moment
 * that has passed, an app no longer connected, the app not answering).
 */
export function saveRefusal(draft: Pick<AutomationDraft, "title">, error: unknown): SaveNotice {
  const title = `Couldn’t save “${draft.title}”`;
  if (error instanceof ApiError && error.status === 409) {
    const automationId = typeof error.details?.automationId === "string" ? error.details.automationId : null;
    if (error.details?.status === "saved")
      return { kind: "done", title: "Already saved", ...(automationId ? { action: { label: "Open", href: automationHref(automationId) } } : {}) };
    return { kind: "none", title };
  }
  if (error instanceof ApiError && error.planLimit) return { kind: "error", title, body: error.message, action: { label: "See plans", href: PRICING_PATH } };
  return { kind: "error", title, body: error instanceof Error ? error.message : undefined };
}
