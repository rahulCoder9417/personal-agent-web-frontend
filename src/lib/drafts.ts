// The answer Tex is writing, shown as it is written: what the chat thread draws while a reply comes
// in. The backend sends the whole text so far with every `message.draft` on the live stream (web chat
// turns only); nothing of it is saved, the answer itself arrives as a message like any other. These
// are the rules for what is shown where, kept apart from React so they can be tested on their own.
// `src/lib/api/stream.ts` feeds them the events.
//
// Tex starts the draft over (an empty draft) at each tool call, each new message of its own and each
// round of the crew, so a turn is a few runs of text one after another. Two rules keep that calm:
// - A run is shown only once it is worth showing (`SHOW_AT_CHARS`, a line break, or `SHOW_AFTER_MS`
//   of writing without starting over), so a short "Let me check your calendar." before a tool never
//   flashes on screen.
// - What was shown never vanishes: a run that was on screen and is started over becomes a step, one
//   muted line with what Tex went on to do under it. When the answer arrives, the steps fold into a
//   "Show steps" toggle on it (for this session only: they are not saved).

import type { Message, MessageDraft } from "./api/client";
import { addProgress, type ProgressLine } from "./crew";

/** A run of text this long is shown at once. */
export const SHOW_AT_CHARS = 80;
/** A shorter run is shown once Tex has been writing it this long without starting over. */
export const SHOW_AFTER_MS = 1200;
/** How many steps are on screen; older ones fold into "+N earlier steps". */
export const STEPS_SHOWN = 3;
/** How many finished turns are remembered, so a late draft of one of them is never shown again. */
const CLOSED_KEPT = 20;
/** How many answers keep their folded steps (this session only). */
const FOLDED_KEPT = 40;
/** How many steps one turn keeps. */
const STEPS_KEPT = 30;

/** A run of text that was shown and then started over: kept as one muted line, with what Tex went on to do. */
export type DraftStep = { text: string; progress: ProgressLine[] };

/** The text Tex is writing since it last started over. */
export type DraftRun = {
  /** Counts the turn's runs, so a timer started for one run never reveals the next. */
  no: number;
  text: string;
  /** When it started, by this browser's clock (ms). */
  since: number;
  /** It is on screen: worth showing when it arrived, or written for `SHOW_AFTER_MS`. Once shown, it stays shown. */
  shown: boolean;
  /** Progress lines that arrived while it was on screen. */
  progress: ProgressLine[];
};

/** One conversation's turn as the thread shows it. */
export type DraftTurn = {
  turnId: string;
  /** The incoming message the turn answers; null for a turn that answers none (an automation's run). */
  messageId: string | null;
  /** When the turn's first draft was written (the backend's clock), to know its answer in the thread. */
  startedAt: string;
  run: DraftRun | null;
  /** How many runs the turn has had, so each has a number of its own. */
  runs: number;
  /** Runs that were shown and started over, oldest first. */
  steps: DraftStep[];
  /** The turn ended without its answer: its steps stay on screen until the next message arrives. */
  over: boolean;
};

export type Drafts = {
  /** The turn on screen in each conversation, by conversation id. */
  turns: Record<string, DraftTurn>;
  /** Turns whose answer already arrived, or that ended (by `turnId`): a draft of theirs that comes later is dropped. */
  closed: string[];
  /**
   * Conversations whose answer arrived before any draft of the turn (the answer can overtake the
   * turn's last draft on the way). The next draft there belongs to that turn, so it is dropped,
   * until the turn is over.
   */
  answered: string[];
  /** The steps of answered turns, by the id of the message they folded into. */
  folded: Record<string, DraftStep[]>;
};

export const NO_DRAFTS: Drafts = { turns: {}, closed: [], answered: [], folded: {} };

/** Where the drafts live in the query cache (live only: never fetched). */
export const DRAFTS_KEY = ["agent", "drafts"] as const;

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const rest = { ...record };
  delete rest[key];
  return rest;
}

const closing = (closed: string[], turnId: string) => (closed.includes(turnId) ? closed : [...closed, turnId].slice(-CLOSED_KEPT));

/** Whether a run's text is worth showing as soon as it arrives: long enough, or more than one line. */
export function worthShowing(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= SHOW_AT_CHARS || trimmed.includes("\n");
}

const asStep = (run: DraftRun): DraftStep => ({ text: run.text, progress: run.progress });
const withStep = (steps: DraftStep[], run: DraftRun | null): DraftStep[] => (run?.shown ? [...steps, asStep(run)].slice(-STEPS_KEPT) : steps);

function setTurn(drafts: Drafts, conversationId: string, turn: DraftTurn | null): Drafts {
  return { ...drafts, turns: turn ? { ...drafts.turns, [conversationId]: turn } : without(drafts.turns, conversationId) };
}

/** A new run of text, starting now. */
function newRun(text: string, no: number, now: number): DraftRun {
  return { no, text, since: now, shown: worthShowing(text), progress: [] };
}

/**
 * A `message.draft` arrived. Within a run the text only grows. An empty text means Tex started
 * over: a run that was shown becomes a step, one that wasn't (a short line before a tool) goes
 * without ever having been seen. A text that doesn't carry on from the run is a new run too: the
 * backend keeps only the newest of a turn's drafts for a slow connection, so the empty one between
 * them can be skipped. `now` is this browser's clock.
 */
export function draftArrived(drafts: Drafts, draft: MessageDraft, now: number): Drafts {
  if (drafts.closed.includes(draft.turnId)) return drafts;
  const { conversationId } = draft;
  if (drafts.answered.includes(conversationId)) {
    // A late draft of the turn whose answer is already there: that turn is over for this screen.
    return { ...drafts, closed: closing(drafts.closed, draft.turnId), answered: drafts.answered.filter((id) => id !== conversationId) };
  }

  const before = drafts.turns[conversationId];
  let turn: DraftTurn;
  let closed = drafts.closed;
  if (before && before.turnId === draft.turnId) {
    turn = before;
  } else {
    // A new turn here. What one before it left on screen (it ended without its answer) stays above it.
    if (before) closed = closing(closed, before.turnId);
    turn = {
      turnId: draft.turnId,
      messageId: draft.messageId,
      startedAt: draft.at,
      run: null,
      runs: 0,
      steps: before ? withStep(before.steps, before.run) : [],
      over: false,
    };
  }
  const run = turn.run;
  const next = (changed: DraftTurn): Drafts => ({ ...setTurn(drafts, conversationId, changed), closed });

  if (!draft.text.trim()) {
    if (!run && turn === before) return drafts;
    return next({ ...turn, run: null, steps: withStep(turn.steps, run) });
  }
  if (run && draft.text.startsWith(run.text.trimEnd())) {
    if (draft.text === run.text) return drafts;
    return next({ ...turn, run: { ...run, text: draft.text, shown: run.shown || worthShowing(draft.text) } });
  }
  return next({ ...turn, run: newRun(draft.text, turn.runs + 1, now), runs: turn.runs + 1, steps: withStep(turn.steps, run) });
}

/**
 * `SHOW_AFTER_MS` after a run started: if it is still being written (no start over since), it is
 * shown now, however short. `no` names the run the timer was started for.
 */
export function runRevealed(drafts: Drafts, conversationId: string, turnId: string, no: number): Drafts {
  const turn = drafts.turns[conversationId];
  const run = turn?.run;
  if (!turn || turn.turnId !== turnId || !run || run.no !== no || run.shown) return drafts;
  return setTurn(drafts, conversationId, { ...turn, run: { ...run, shown: true } });
}

/**
 * A progress line arrived (what Tex or the crew is doing). It goes with what is on screen of each
 * turn that is running: the run being written, or else the last step, so it shows under that step.
 * With neither, the "working" bubble shows it, as before.
 */
export function progressArrived(drafts: Drafts, line: ProgressLine): Drafts {
  let turns = drafts.turns;
  for (const [conversationId, turn] of Object.entries(drafts.turns)) {
    if (turn.over) continue;
    let next: DraftTurn | null = null;
    if (turn.run?.shown) next = { ...turn, run: { ...turn.run, progress: addProgress(turn.run.progress, line) } };
    else if (turn.steps.length) {
      const last = turn.steps[turn.steps.length - 1];
      next = { ...turn, steps: [...turn.steps.slice(0, -1), { ...last, progress: addProgress(last.progress, line) }] };
    }
    if (next) turns = { ...turns, [conversationId]: next };
  }
  return turns === drafts.turns ? drafts : { ...drafts, turns };
}

/** The turn's steps fold into a message, and the turn leaves the screen. */
function foldInto(drafts: Drafts, conversationId: string, messageId: string, steps: DraftStep[]): Drafts {
  const rest = setTurn(drafts, conversationId, null);
  if (!steps.length) return rest;
  const kept = Object.entries(drafts.folded).filter(([id]) => id !== messageId).slice(-(FOLDED_KEPT - 1));
  return { ...rest, folded: { ...Object.fromEntries(kept), [messageId]: steps } };
}

/**
 * A message was saved. Tex's answer (anything Tex wrote that isn't an approval card, the apology for
 * a failed turn among them) takes the draft's place, the turn's steps fold into it, and the turn's
 * later drafts are dropped. An approval card or an incoming message changes nothing while the turn
 * runs (Tex may still be writing after a card); once it ended without its answer, what it left on
 * screen folds into whichever message comes next.
 */
export function messageArrived(drafts: Drafts, message: Pick<Message, "id" | "conversationId" | "direction" | "approvalId">): Drafts {
  const turn = drafts.turns[message.conversationId];
  if (message.direction !== "out" || message.approvalId) {
    return turn?.over ? foldInto(drafts, message.conversationId, message.id, turn.steps) : drafts;
  }
  if (turn) return { ...foldInto(drafts, message.conversationId, message.id, turn.steps), closed: closing(drafts.closed, turn.turnId) };
  if (drafts.answered.includes(message.conversationId)) return drafts;
  return { ...drafts, answered: [...drafts.answered, message.conversationId] };
}

/** A turn ended without its answer: a run that was shown becomes a step, and the steps stay until the next message. */
function ended(drafts: Drafts, conversationId: string, turn: DraftTurn): Drafts {
  const steps = withStep(turn.steps, turn.run);
  const closed = closing(drafts.closed, turn.turnId);
  if (!steps.length) return { ...setTurn(drafts, conversationId, null), closed };
  return { ...setTurn(drafts, conversationId, { ...turn, run: null, steps, over: true }), closed };
}

/**
 * The incoming message a turn answered moved on (`delivered` or `failed`): that turn is over. Its
 * answer is normally there already; if not (a failed turn's apology comes after), its steps wait for it.
 */
export function messageSettled(drafts: Drafts, message: Pick<Message, "id" | "direction" | "status">): Drafts {
  if (message.direction !== "in" || (message.status !== "delivered" && message.status !== "failed")) return drafts;
  const entry = Object.entries(drafts.turns).find(([, turn]) => !turn.over && turn.messageId === message.id);
  return entry ? ended(drafts, entry[0], entry[1]) : drafts;
}

/**
 * The agent is no longer at work (`agent.status` other than `busy`, at the end of a turn and at the
 * start of the next one): nothing is being written. Each turn still running ends as above. The
 * finished turns are still remembered.
 */
export function turnsOver(drafts: Drafts): Drafts {
  let next = drafts;
  for (const [conversationId, turn] of Object.entries(drafts.turns)) if (!turn.over) next = ended(next, conversationId, turn);
  return next.answered.length ? { ...next, answered: [] } : next;
}

/**
 * The stream came back and the agent turned out not to be at work: the turns it was writing ended
 * while the stream was down. They end as above; their answer, if one was missed, comes with the
 * thread asked for again (`answerInThread`). A turn that answers no message of its own can't be
 * matched to its answer that way, so it goes.
 */
export function turnsOverAfterReconnect(drafts: Drafts): Drafts {
  const next = turnsOver(drafts);
  let turns = next.turns;
  for (const [conversationId, turn] of Object.entries(next.turns)) if (turn.messageId === null) turns = without(turns, conversationId);
  return turns === next.turns ? next : { ...next, turns };
}

/**
 * Tex's answer to a turn, when it is already in the conversation's thread (it came with the thread
 * asked for again, not as an event): the first message Tex wrote after the one the turn answers,
 * not an approval card, saved after the turn began. `messages` is the thread, newest first.
 */
export function answerInThread(
  messages: readonly Pick<Message, "id" | "direction" | "approvalId" | "createdAt">[],
  turn: Pick<DraftTurn, "messageId" | "startedAt">,
): string | null {
  if (turn.messageId === null) return null;
  const asked = messages.findIndex((message) => message.id === turn.messageId);
  for (let index = asked - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.direction === "out" && !message.approvalId && Date.parse(message.createdAt) >= Date.parse(turn.startedAt)) return message.id;
  }
  return null;
}

/** The answer named is in the thread: the turn's steps fold into it, and its later drafts are dropped. */
export function turnAnswered(drafts: Drafts, conversationId: string, messageId: string): Drafts {
  const turn = drafts.turns[conversationId];
  if (!turn) return drafts;
  return { ...foldInto(drafts, conversationId, messageId, turn.steps), closed: closing(drafts.closed, turn.turnId) };
}

/** What a conversation's thread shows of its turn: the steps, and the run being written once it is worth showing. */
export type TurnOnScreen = {
  steps: DraftStep[];
  /** The text being written, or null while there is none worth showing. */
  writing: string | null;
  /** The turn still runs (it hasn't ended without its answer). */
  live: boolean;
  turn: DraftTurn;
};

export function turnOnScreen(drafts: Drafts, conversationId: string | null): TurnOnScreen | null {
  const turn = conversationId ? drafts.turns[conversationId] : undefined;
  if (!turn) return null;
  return { steps: turn.steps, writing: turn.run?.shown ? turn.run.text : null, live: !turn.over, turn };
}

/** A step as one line: the words, without line breaks or the marks of Markdown. */
export function stepLine(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|~~|`+)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which steps are on screen: the last `STEPS_SHOWN`, unless all were asked for, and how many earlier ones are folded. */
export function stepsToShow(steps: readonly DraftStep[], all: boolean): { shown: readonly DraftStep[]; earlier: number } {
  if (all || steps.length <= STEPS_SHOWN) return { shown: steps, earlier: 0 };
  return { shown: steps.slice(-STEPS_SHOWN), earlier: steps.length - STEPS_SHOWN };
}
