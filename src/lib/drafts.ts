// The answer Tex is writing, shown as it is written: what the chat thread draws in place of the
// "Tex is working" bubble while a reply comes in. The backend sends the whole text so far with every
// `message.draft` on the live stream (web chat turns only); nothing of it is saved, the answer itself
// arrives as a message like any other. These are the rules for which draft is shown where, kept apart
// from React so they can be tested on their own. `src/lib/api/stream.ts` feeds them the events.

import type { Message, MessageDraft } from "./api/client";

/** How many finished turns are remembered, so a late draft of one of them is never shown again. */
const CLOSED_KEPT = 20;

export type Drafts = {
  /** The draft shown in each conversation, by conversation id. Only the latest of its turn. */
  shown: Record<string, MessageDraft>;
  /** Turns whose answer already arrived (by `turnId`): a draft of theirs that comes later is dropped. */
  closed: string[];
  /**
   * Conversations whose answer arrived while no draft of the turn had been shown (the answer can
   * overtake the turn's last draft on the way). The next draft there belongs to that turn, so it is
   * dropped, until the turn is over.
   */
  answered: string[];
};

export const NO_DRAFTS: Drafts = { shown: {}, closed: [], answered: [] };

/** Where the drafts live in the query cache (live only: never fetched). */
export const DRAFTS_KEY = ["agent", "drafts"] as const;

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const rest = { ...record };
  delete rest[key];
  return rest;
}

const closing = (closed: string[], turnId: string) => (closed.includes(turnId) ? closed : [...closed, turnId].slice(-CLOSED_KEPT));

/**
 * A `message.draft` arrived: it becomes what its conversation shows, unless its turn is over.
 * An empty text means Tex started over (a new message, or it went on to a tool), so the conversation
 * goes back to the "working" bubble.
 */
export function draftArrived(drafts: Drafts, draft: MessageDraft): Drafts {
  if (drafts.closed.includes(draft.turnId)) return drafts;
  if (drafts.answered.includes(draft.conversationId)) {
    // A late draft of the turn whose answer is already there: that turn is over for this screen.
    return { ...drafts, closed: closing(drafts.closed, draft.turnId), answered: drafts.answered.filter((id) => id !== draft.conversationId) };
  }
  if (!draft.text.trim()) return { ...drafts, shown: without(drafts.shown, draft.conversationId) };
  return { ...drafts, shown: { ...drafts.shown, [draft.conversationId]: draft } };
}

/**
 * A message was saved. Tex's answer (anything Tex wrote that isn't an approval card, the apology for
 * a failed turn among them) takes the draft's place, and the turn's later drafts are dropped. An
 * approval card changes nothing: Tex may still be writing a few words after it.
 */
export function messageArrived(drafts: Drafts, message: Pick<Message, "conversationId" | "direction" | "approvalId">): Drafts {
  if (message.direction !== "out" || message.approvalId) return drafts;
  const shown = drafts.shown[message.conversationId];
  if (shown) return { ...drafts, shown: without(drafts.shown, message.conversationId), closed: closing(drafts.closed, shown.turnId) };
  if (drafts.answered.includes(message.conversationId)) return drafts;
  return { ...drafts, answered: [...drafts.answered, message.conversationId] };
}

/**
 * The incoming message a turn answered moved on (`delivered` or `failed`): that turn is over, and
 * its draft goes.
 */
export function messageSettled(drafts: Drafts, message: Pick<Message, "id" | "direction" | "status">): Drafts {
  if (message.direction !== "in" || (message.status !== "delivered" && message.status !== "failed")) return drafts;
  const entry = Object.entries(drafts.shown).find(([, draft]) => draft.messageId === message.id);
  if (!entry) return drafts;
  return { ...drafts, shown: without(drafts.shown, entry[0]), closed: closing(drafts.closed, entry[1].turnId) };
}

/**
 * The agent is no longer at work (`agent.status` other than `busy`, at the end of a turn and at the
 * start of the next one), or the stream reconnected and may have missed the end: nothing is being
 * written. The finished turns are still remembered.
 */
export function turnsOver(drafts: Drafts): Drafts {
  if (Object.keys(drafts.shown).length === 0 && drafts.answered.length === 0) return drafts;
  return { ...drafts, shown: {}, answered: [] };
}
