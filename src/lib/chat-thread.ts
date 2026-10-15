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
 * The thread's activity. When Tex's newest message is a question (an approval card), the turn has
 * paused for the person:
 * - still to answer: Tex is **waiting** for the OK, however long the turn takes to wind down, so the
 *   "working" bubble doesn't spin while nothing happens until the person answers;
 * - answered (approved or denied): Tex's follow-up runs in this conversation, after the card, so
 *   Tex is **working** while the agent is waking or busy for it, and at once after an answer given
 *   in this browser (`answeredHere`); its message then becomes the newest and the rule below applies;
 * - expired, or anything else: nothing.
 * Otherwise Tex is working while it answers a message of the person's here (`threadIsWorking`).
 *
 * `messages` is the thread, newest first; `approval` is the newest message's approval, when it is
 * a question (undefined while it isn't known).
 */
export function threadActivity(input: {
  status: Pick<AgentStatus, "state" | "lastActiveAt"> | undefined;
  messages: readonly Pick<Message, "direction" | "status" | "approvalId">[];
  approval: Pick<Approval, "status" | "decidedAt"> | null | undefined;
  answeredHere: boolean;
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
  return threadIsWorking(state === "busy", messages) ? "working" : null;
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
