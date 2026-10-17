// What the chat thread shows apart from the messages themselves: whether Tex is at work in it, or
// waiting for the person's OK.

import { useSyncExternalStore } from "react";
import type { AgentStatus, Approval, Message } from "./api/client";

/**
 * Whether the "Tex is working" bubble belongs in a conversation's thread. The agent's status and
 * progress say nothing about which conversation the turn is for, so the thread must have a turn of
 * its own going: the backend moves the incoming message a turn answers to `processing` when the
 * agent takes it, and on to `delivered` or `failed` when the turn ends (`message.status` on the
 * stream). Messages still `queued` wait behind it and are skipped, so it is the newest incoming
 * message that has left the queue. `busy` must hold too, so a message left `processing` by a turn
 * that never finished doesn't keep the bubble up.
 *
 * `messages` is the conversation's thread as the API lists it, newest first. A turn in another
 * conversation (an earlier web chat, or one on Telegram) doesn't show here.
 */
export function threadIsWorking(busy: boolean, messages: readonly Pick<Message, "direction" | "status">[]): boolean {
  if (!busy) return false;
  const taken = messages.find((message) => message.direction === "in" && message.status !== "queued");
  return taken?.status === "processing";
}

/**
 * What the end of a thread says about Tex: at work ("Tex is working…"), waiting for the person's
 * OK on the question it just asked, or nothing.
 */
export type ThreadActivity = "working" | "waiting" | null;

/**
 * After the person answers a question of Tex's here, the thread shows Tex at work at once: the
 * follow-up turn is picked up and the container woken before the agent's state says `busy` (about
 * 2 seconds when it is awake, more when it has to wake). Past this, the agent's state decides.
 */
export const ANSWER_GRACE_MS = 15_000;

/**
 * The follow-up to an answer starts within this of the answer (a turn is cut at 15 minutes, and the
 * follow-up waits at most for the turn before it). A turn that starts later is about something else.
 */
export const ANSWER_TURN_MAX_MS = 15 * 60_000;

/**
 * A message of the person's that Tex hasn't taken yet shows Tex at work for this long after it was
 * sent. The agent takes a message (`processing`, then `busy`) only once its turn has started, the
 * container is awake and the message handed over: about 2.5 seconds after sending when the
 * container is awake, 5 to 7 seconds when it has to wake (the turns of 15 to 17 October), more when
 * the live stream is slow to bring the news. A message answered without the agent (a quick reply,
 * no credits) is never taken at all. So Tex shows at work from the moment of sending; the message's
 * own states take over (`delivered` or `failed` end it), and one still waiting after this long shows
 * nothing more, so a message whose turn never ran doesn't keep the bubble up.
 */
export const QUEUED_WORKING_MS = 2 * 60_000;

/**
 * Until when the person's newest message here shows Tex at work while it waits (`queued`, also
 * while it is being sent), or null when it doesn't wait. Longer while the agent is waking or busy:
 * the message waits behind that turn, which lasts at most `ANSWER_TURN_MAX_MS`.
 */
export function waitingForTexUntil(
  state: AgentStatus["state"] | undefined,
  messages: readonly (Pick<Message, "direction" | "status"> & { createdAt?: string })[],
): number | null {
  const newest = messages.find((message) => message.direction === "in");
  if (newest?.status !== "queued") return null;
  const sent = Date.parse(newest.createdAt ?? "");
  if (Number.isNaN(sent)) return null;
  return sent + (state === "busy" || state === "waking" ? ANSWER_TURN_MAX_MS : QUEUED_WORKING_MS);
}

/** The local id of a message shown before the API saved it (`localMessage` in api/hooks.ts). */
const LOCAL_PREFIX = "local:";

/**
 * What a message of the person's says about itself under it: "sending" only while it is on its
 * way to the API, "sent" once saved and waiting for Tex (before, a saved message said "sending"
 * until Tex took it, 2.5 to 7 seconds later, as if it hadn't gone), "Tex is on it" once taken.
 */
export function inboundStatusWord(message: Pick<Message, "id" | "status">): string | undefined {
  switch (message.status) {
    case "queued":
      return message.id.startsWith(LOCAL_PREFIX) ? "sending" : "sent";
    case "processing":
      return "Tex is on it";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "not sent";
    default:
      return undefined;
  }
}

/**
 * The thread's activity. When Tex's newest message is a question (an approval card), the turn has
 * paused for the person:
 * - still to answer: Tex is **waiting** for the OK, however long the turn takes to wind down, so the
 *   "working" bubble doesn't spin while nothing happens until the person answers;
 * - answered (approved or denied): Tex's follow-up runs in this conversation, after the card, so
 *   Tex is **working** while the agent is waking or busy for it, and at once after an answer given
 *   in this browser (`answeredHere`); its message then becomes the newest and the rule below applies;
 * - expired, or anything else: nothing.
 * Otherwise Tex is working while it answers a message of the person's here (`threadIsWorking`), and
 * from the moment one is sent until the agent takes it (`waitingForTexUntil`).
 *
 * `messages` is the thread, newest first; `approval` is the newest message's approval, when it is
 * a question (undefined while it isn't known); `now` is the time a waiting message is judged at.
 */
export function threadActivity(input: {
  status: Pick<AgentStatus, "state" | "lastActiveAt"> | undefined;
  messages: readonly (Pick<Message, "direction" | "status" | "approvalId"> & { createdAt?: string })[];
  approval: Pick<Approval, "status" | "decidedAt"> | null | undefined;
  answeredHere: boolean;
  now?: number;
}): ThreadActivity {
  const { status, messages, approval } = input;
  const state = status?.state;
  const newest = messages[0];
  if (newest?.direction === "out" && newest.approvalId) {
    if (approval?.status === "pending") return "waiting";
    if (approval?.status !== "approved" && approval?.status !== "rejected") return null;
    if (input.answeredHere) return "working";
    if (state !== "busy" && state !== "waking") return null;
    // Busy long after the answer is a turn about something else (in another chat).
    const decided = Date.parse(approval.decidedAt ?? "");
    const since = Date.parse(status?.lastActiveAt ?? "");
    if (!Number.isNaN(decided) && !Number.isNaN(since) && since - decided > ANSWER_TURN_MAX_MS) return null;
    return "working";
  }
  if (threadIsWorking(state === "busy", messages)) return "working";
  const until = waitingForTexUntil(state, messages);
  return until !== null && (input.now ?? Date.now()) < until ? "working" : null;
}

// The questions the person answered in this browser in the last `ANSWER_GRACE_MS` (by approval id).
const answered = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** The person answered a question of Tex's here (Approve or Deny): for a moment Tex shows at work in its thread. */
export function noteAnswered(approvalId: string, graceMs = ANSWER_GRACE_MS): void {
  answered.add(approvalId);
  notify();
  setTimeout(() => {
    answered.delete(approvalId);
    notify();
  }, graceMs);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the person answered this question here in the last `ANSWER_GRACE_MS`. */
export function useAnsweredHere(approvalId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (approvalId ? answered.has(approvalId) : false),
    () => false,
  );
}
