// The foot of a turn in the chat thread: what says, under the newest thing on screen, that Tex is at
// work, writing, or waiting for the person's OK. Kept apart from React so it can be tested on its own.
//
// One turn reads as one piece of work. Before, the "Tex is working…" bubble was swapped for the text
// Tex was writing and came back each time Tex went on to a tool, and came back again under its answer
// for the moment before the turn ended: on a turn of several steps it went off and on again and again,
// and looked like the agent being started over. Now:
// - From Send (the person's message waiting for Tex, `waitingForTexUntil` in `chat-thread.ts`) until
//   anything of the turn is on screen, the "Tex is working…" bubble (`start`).
// - From then on one quiet line under the newest thing, until the turn is over: "Tex is writing…"
//   while a draft is shown, "Tex is working…" between drafts, under a step and under a message Tex
//   sent in the middle of the turn, and "Waiting for your OK" once Tex asked. Its words change; it is
//   never taken away and put back while the turn runs.
// - It goes when the turn is over: the person's message `delivered` or `failed`, or the agent no
//   longer busy (`threadActivity` in `chat-thread.ts`), and it is never shown for a turn in another chat.

import type { AgentStatus, Approval, Message } from "./api/client";
import { threadActivity, type ThreadActivity } from "./chat-thread";
import type { TurnOnScreen } from "./drafts";

/**
 * What the foot of the thread shows:
 * - `start`: the "Tex is working…" bubble, while nothing of the turn is on screen yet;
 * - `writing`, `working`, `waiting`: the one line under the newest thing;
 * - null: nothing (no turn here, or it is over).
 */
export type TurnFoot = "start" | "working" | "writing" | "waiting" | null;

/** Whether the foot says Tex is at work (the bubble, or the line while Tex works or writes): not while it waits for the OK. */
export const footAtWork = (foot: TurnFoot): boolean => foot === "start" || foot === "working" || foot === "writing";

type Row = Pick<Message, "direction" | "status" | "approvalId" | "createdAt">;
type Asked = Pick<Approval, "status" | "decidedAt">;

/**
 * The question Tex asked in the thread's latest turn (its approval id): an approval card among Tex's
 * messages since the person's newest one. Tex often writes a line after the card ("Waiting for your
 * approval, you'll see the buttons above"), so it need not be the newest message. `messages`: newest first.
 */
export function turnQuestion(messages: readonly Pick<Message, "direction" | "approvalId">[]): string | null {
  for (const message of messages) {
    if (message.direction === "in") return null;
    if (message.approvalId) return message.approvalId;
  }
  return null;
}

/**
 * The thread as `threadActivity` reads it. Lines Tex wrote after its question and before the person
 * answered it are part of asking: they are left out, so the question counts as the newest message and
 * Tex waits for the OK (or, once answered, works on what follows). Once Tex wrote after the answer (its
 * follow-up said something), or the question expired, the thread is read as it is.
 */
export function asAsked<T extends Row>(messages: readonly T[], approval: Asked | null | undefined): readonly T[] {
  const at = messages.findIndex((message) => message.direction === "in" || message.approvalId);
  if (at <= 0 || messages[at].direction === "in" || !approval) return messages;
  if (approval.status === "pending") return messages.slice(at);
  if (approval.status !== "approved" && approval.status !== "rejected") return messages;
  const decided = Date.parse(approval.decidedAt ?? "");
  const followedUp = Number.isNaN(decided) || messages.slice(0, at).some((message) => Date.parse(message.createdAt) >= decided);
  return followedUp ? messages : messages.slice(at);
}

/**
 * What the foot of a conversation's thread shows.
 *
 * `messages`: the thread, newest first. `approval`: the approval of the turn's question
 * (`turnQuestion`), undefined while it isn't known. `answeredHere`: the person answered that question
 * in this browser a moment ago. `turn`: the turn being written in this conversation (`turnOnScreen`),
 * or null (none, or its answer is already in the thread). `now`: the time a message still waiting for
 * Tex is judged at (`threadActivity`).
 */
export function threadFoot(input: {
  status: Pick<AgentStatus, "state" | "lastActiveAt"> | undefined;
  messages: readonly Row[];
  approval: Asked | null | undefined;
  answeredHere: boolean;
  turn: Pick<TurnOnScreen, "steps" | "writing" | "live"> | null;
  now?: number;
}): TurnFoot {
  const { status, messages, approval, answeredHere, turn, now } = input;
  const activity: ThreadActivity = threadActivity({ status, messages: asAsked(messages, approval), approval, answeredHere, now });
  if (turn?.writing != null) return "writing";
  const steps = turn?.steps.length ?? 0;
  // A turn written here that still runs: it is this conversation's (an automation's run, the follow-up
  // to an answer), whatever its messages say.
  const drafting = turn?.live === true && status?.state === "busy";
  if (activity === "working") {
    // Something of the turn is on screen once a step is, or once Tex said something in it.
    return steps === 0 && messages[0]?.direction !== "out" ? "start" : "working";
  }
  if (drafting && steps > 0) return "working";
  if (activity === "waiting") return "waiting";
  return drafting ? "start" : null;
}
