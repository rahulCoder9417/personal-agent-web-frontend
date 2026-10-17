// "Ask Tex to set it up" on the New automation page: the request is sent with
// `purpose: automation_draft` (the backend puts it in the Automations chat and tells Tex to only
// draft it, or say why it can't be one), and the page stays where it is until Tex's verdict comes.
// These are the rules for what the page shows meanwhile. No React here, so they can be unit tested.

import { ApiError, errorMessage, type Message } from "./api/client";
import { AUTOMATIONS_CHAT_HREF } from "./conversations";

/** With no verdict after this long, the page says so and points to the chat (the turn goes on there). */
export const DRAFT_ASK_SLOW_MS = 90_000;

/** What the box says while Tex looks at the request. */
export const CHECKING_TEXT = "Tex is checking if this can be an automation…";
/** A turn that failed (the message `failed`). */
export const ASK_FAILED_TEXT = "Tex couldn’t check this just now. Try again in a moment.";

/**
 * What the page shows under the box:
 * - `idle`: nothing asked yet (or the box was emptied of a verdict);
 * - `checking`: the request is on its way, or Tex is at it;
 * - `draft`: Tex drafted it: the page opens it on the canvas;
 * - `cant`: Tex says why it can't be an automation, with a request that would work;
 * - `failed`: the send was refused, or the turn failed;
 * - `elsewhere`: no verdict yet after `DRAFT_ASK_SLOW_MS` (`slow`), or Tex asked for an OK
 *   (`asked`), which is answered in the chat: a link to it.
 */
export type DraftAskView =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "draft"; draftId: string }
  | { kind: "cant"; text: string }
  | { kind: "failed"; text: string; outOfCredits: boolean }
  | { kind: "elsewhere"; why: "slow" | "asked"; href: string };

/** The request as the API saved it. */
export type SentAsk = Pick<Message, "id" | "conversationId" | "status" | "turnId" | "createdAt">;

/**
 * Whether `message` belongs to the turn that answers `sent`. The backend gives every message its
 * turn's id, so the answer is found even when an automation's run answers in the same chat
 * meanwhile. A backend that doesn't say it yet: any message of Tex's after the request.
 */
function answers(sent: SentAsk, message: Message, newerThanSent: boolean): boolean {
  if (message.direction !== "out") return false;
  if (sent.turnId) return message.turnId === sent.turnId;
  return newerThanSent;
}

/**
 * What the page shows, from where the request is: being sent (`sending`), refused (`sendError`),
 * or saved (`sent`) with its conversation's messages as the cache has them (`thread`, newest first;
 * undefined while they haven't come), and whether `DRAFT_ASK_SLOW_MS` has passed (`slow`).
 *
 * Tex's draft wins: it is posted during the turn, before anything Tex says at its end. A failed
 * turn says so, whatever Tex's apology said before. A plain answer is Tex's "why not".
 */
export function draftAskView(input: {
  sending: boolean;
  sendError: unknown;
  sent: SentAsk | null;
  thread: readonly Message[] | undefined;
  slow: boolean;
}): DraftAskView {
  const { sent, thread } = input;
  if (input.sending) return { kind: "checking" };
  if (input.sendError) {
    const outOfCredits = input.sendError instanceof ApiError && input.sendError.outOfCredits;
    return { kind: "failed", text: outOfCredits ? "You’re out of credits, so Tex can’t check this right now." : errorMessage(input.sendError), outOfCredits };
  }
  if (!sent) return { kind: "idle" };

  const items = thread ?? [];
  const at = items.findIndex((message) => message.id === sent.id);
  // Newest first: what comes before the request in the list was said after it.
  const theirs = items.filter((message, index) => answers(sent, message, at > 0 && index < at));
  const draft = theirs.find((message) => message.automationDraftId);
  if (draft?.automationDraftId) return { kind: "draft", draftId: draft.automationDraftId };
  const status = (at >= 0 ? items[at].status : undefined) ?? sent.status;
  if (status === "failed") return { kind: "failed", text: ASK_FAILED_TEXT, outOfCredits: false };
  if (theirs.some((message) => message.approvalId)) return { kind: "elsewhere", why: "asked", href: AUTOMATIONS_CHAT_HREF };
  const answer = theirs.find((message) => message.text.trim());
  if (answer) return { kind: "cant", text: plainNote(answer.text) };
  if (input.slow) return { kind: "elsewhere", why: "slow", href: AUTOMATIONS_CHAT_HREF };
  return { kind: "checking" };
}

/**
 * Tex's words for the note, without the Markdown marks a sentence or two may carry (bold, italics,
 * code): the note is short plain text, not a chat bubble.
 */
export function plainNote(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}
