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
//   muted line. What Tex goes on to do is a step too: each of Tex's own progress lines ("Checked your
//   inbox"), also when it wrote nothing before it; a crew member's line goes under the step it
//   follows. When the answer arrives, it carries the turn's steps as one line on it ("Checked your
//   inbox · 2 steps", `trailLine`), which opens them (for this session only: they are not saved).

import type { Message, MessageDraft } from "./api/client";
import { addProgress, type ProgressLine } from "./crew";

/** A run of text this long is shown at once. */
export const SHOW_AT_CHARS = 80;
/** A shorter run is shown once Tex has been writing it this long without starting over. */
export const SHOW_AFTER_MS = 1200;
/** How many lines of steps are on screen; older ones fold into "+N earlier steps". */
export const STEPS_SHOWN = 3;
/** How many finished turns are remembered, so a late draft of one of them is never shown again. */
const CLOSED_KEPT = 20;
/** How many answers keep their folded steps (this session only). */
const FOLDED_KEPT = 40;
/** How many steps one turn keeps. */
const STEPS_KEPT = 30;
/**
 * Steps kept aside for a turn with nothing on screen (`Drafts.loose`) still go to its answer when the
 * answer comes this long after the turn ended (the answer and the end of the turn travel apart).
 */
export const LOOSE_KEPT_MS = 30_000;

/**
 * One step of a turn, as one muted line:
 * - a run of text that was shown and then started over (`text`, what Tex wrote);
 * - something Tex did (`action`: its progress line, "Checked your inbox");
 * - or, with no `text`, the crew at work before Tex had shown anything.
 * `progress` is the crew's latest line each (the progress lines that followed it).
 */
export type DraftStep = { text: string; progress: ProgressLine[]; action?: true };

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
  /**
   * The question Tex asked in this turn (the id of its approval card's message). The steps before
   * it folded into it when it arrived; if the turn then ends without an answer, the rest do too.
   */
  card?: string;
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
  /**
   * The steps of the turn that runs while no conversation has a turn on screen: Tex went straight to
   * its tools without writing (a draft makes the turn), or the turn is in a chat app (Telegram), whose
   * answer isn't written on screen. The agent runs one turn at a time, so they are that turn's. Its
   * first draft takes them; else its answer or question does (`messageArrived`).
   */
  loose: DraftStep[];
  /** When the turn the loose steps belong to ended (this browser's clock), or null while it runs. */
  looseEndedAt: number | null;
};

export const NO_DRAFTS: Drafts = { turns: {}, closed: [], answered: [], folded: {}, loose: [], looseEndedAt: null };

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
  let base = drafts;
  if (before && before.turnId === draft.turnId) {
    turn = before;
  } else {
    // A new turn here. What one before it left on screen (it ended without its answer) stays above it,
    // then what this turn did before its first draft (`loose`). Loose steps of a turn that ended are not this one's.
    if (before) closed = closing(closed, before.turnId);
    const earlier = drafts.looseEndedAt === null ? drafts.loose : [];
    if (drafts.loose.length || drafts.looseEndedAt !== null) base = { ...drafts, loose: [], looseEndedAt: null };
    turn = {
      turnId: draft.turnId,
      messageId: draft.messageId,
      startedAt: draft.at,
      run: null,
      runs: 0,
      steps: [...(before ? withStep(before.steps, before.run) : []), ...earlier].slice(-STEPS_KEPT),
      over: false,
    };
  }
  const run = turn.run;
  const next = (changed: DraftTurn): Drafts => ({ ...setTurn(base, conversationId, changed), closed });

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

/** A step for something Tex did: its progress line ("Checked your inbox"). */
const actionStep = (line: ProgressLine): DraftStep => ({ text: line.text, progress: [], action: true });

/**
 * A progress line joins a turn's steps. Tex's own line is a step of its own. A crew member's goes
 * under the last step (one line per member, its latest), or is a step of its own when there is none.
 */
function stepsWithLine(steps: DraftStep[], line: ProgressLine): DraftStep[] {
  if (line.who === "tex") return [...steps, actionStep(line)].slice(-STEPS_KEPT);
  const last = steps[steps.length - 1];
  if (!last) return [{ text: "", progress: [line] }];
  return [...steps.slice(0, -1), { ...last, progress: addProgress(last.progress, line) }];
}

/**
 * A progress line arrived (what Tex or the crew is doing). It goes to each turn on screen that still runs:
 * - Tex's own line is something it did, so it becomes a step. The run being written ends there: Tex
 *   starts its draft over for every tool, and that empty draft can come a moment after the line. A run
 *   that was shown becomes a step before it; one that wasn't goes, as it would have.
 * - A crew member's line goes with what is on screen: the run being written, else the last step, else
 *   it is a step of its own.
 * With no turn on screen it is kept aside (`loose`) for the turn's answer. A turn that ended left its
 * loose steps for its answer; a new line after that starts the next turn's.
 */
export function progressArrived(drafts: Drafts, line: ProgressLine): Drafts {
  let turns = drafts.turns;
  let running = false;
  for (const [conversationId, turn] of Object.entries(drafts.turns)) {
    if (turn.over) continue;
    running = true;
    let next: DraftTurn;
    if (line.who === "tex") next = { ...turn, run: null, steps: stepsWithLine(withStep(turn.steps, turn.run), line) };
    else if (turn.run?.shown) next = { ...turn, run: { ...turn.run, progress: addProgress(turn.run.progress, line) } };
    else next = { ...turn, steps: stepsWithLine(turn.steps, line) };
    turns = { ...turns, [conversationId]: next };
  }
  if (running) return { ...drafts, turns };
  const loose = drafts.looseEndedAt === null ? drafts.loose : [];
  return { ...drafts, loose: stepsWithLine(loose, line), looseEndedAt: null };
}

/** Whether the loose steps go to a message that arrives now: the turn still runs, or ended a moment ago. */
const looseFor = (drafts: Drafts, now: number): DraftStep[] =>
  drafts.loose.length && (drafts.looseEndedAt === null || now - drafts.looseEndedAt <= LOOSE_KEPT_MS) ? drafts.loose : [];

const NO_LOOSE = { loose: [], looseEndedAt: null } satisfies Pick<Drafts, "loose" | "looseEndedAt">;

/** Steps fold into a message: after any that folded into it before, kept for the last `FOLDED_KEPT` messages. */
function withFolded(folded: Drafts["folded"], messageId: string, steps: DraftStep[]): Drafts["folded"] {
  if (!steps.length) return folded;
  const before = folded[messageId] ?? [];
  const kept = Object.entries(folded).filter(([id]) => id !== messageId).slice(-(FOLDED_KEPT - 1));
  return { ...Object.fromEntries(kept), [messageId]: [...before, ...steps].slice(-STEPS_KEPT) };
}

/** The turn's steps fold into a message, and the turn leaves the screen. */
function foldInto(drafts: Drafts, conversationId: string, messageId: string, steps: DraftStep[]): Drafts {
  return { ...setTurn(drafts, conversationId, null), folded: withFolded(drafts.folded, messageId, steps) };
}

/**
 * A message was saved. Tex's answer (anything Tex wrote that isn't an approval card, the apology for
 * a failed turn among them) takes the draft's place, the turn's steps fold into it, and the turn's
 * later drafts are dropped. An approval card is Tex stopping to ask: the steps before it fold into
 * it, and the turn goes on (Tex may still be writing after a card, and what it writes is not the
 * card). An incoming message changes nothing while the turn runs. Once a turn ended without its
 * answer, what it left on screen folds into whichever message comes next.
 *
 * With no turn on screen in its conversation, Tex's answer or question takes the loose steps (what
 * the turn did with nothing on screen), if the turn still runs or ended within `LOOSE_KEPT_MS`. An
 * incoming message after a turn ended lets them go. `now` is this browser's clock.
 */
export function messageArrived(
  drafts: Drafts,
  message: Pick<Message, "id" | "conversationId" | "direction" | "approvalId">,
  now = Date.now(),
): Drafts {
  const turn = drafts.turns[message.conversationId];
  if (message.direction === "out" && message.approvalId && turn && !turn.over) {
    const asked = { ...turn, steps: [], card: message.id };
    return { ...setTurn(drafts, message.conversationId, asked), folded: withFolded(drafts.folded, message.id, turn.steps) };
  }
  if (message.direction !== "out" || message.approvalId) {
    let next = turn?.over ? foldInto(drafts, message.conversationId, message.id, turn.steps) : drafts;
    if (message.direction === "out") {
      // A question with nothing on screen: what the turn did before it folds into it.
      const loose = looseFor(next, now);
      if (loose.length) next = { ...next, ...NO_LOOSE, folded: withFolded(next.folded, message.id, loose) };
    } else if (next.looseEndedAt !== null) next = { ...next, ...NO_LOOSE };
    return next;
  }
  if (turn) return { ...foldInto(drafts, message.conversationId, message.id, turn.steps), closed: closing(drafts.closed, turn.turnId) };
  const loose = looseFor(drafts, now);
  const next = loose.length ? { ...drafts, ...NO_LOOSE, folded: withFolded(drafts.folded, message.id, loose) } : drafts;
  if (next.answered.includes(message.conversationId)) return next;
  return { ...next, answered: [...next.answered, message.conversationId] };
}

/**
 * A turn ended without its answer: a run that was shown becomes a step, and the steps stay until the
 * next message. A turn that asked a question ended there: its steps fold into the question.
 */
function ended(drafts: Drafts, conversationId: string, turn: DraftTurn): Drafts {
  const steps = withStep(turn.steps, turn.run);
  const closed = closing(drafts.closed, turn.turnId);
  if (turn.card) return { ...foldInto(drafts, conversationId, turn.card, steps), closed };
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
 * finished turns are still remembered. Loose steps are kept for the answer for `LOOSE_KEPT_MS`.
 */
export function turnsOver(drafts: Drafts, now = Date.now()): Drafts {
  let next = drafts;
  for (const [conversationId, turn] of Object.entries(drafts.turns)) if (!turn.over) next = ended(next, conversationId, turn);
  // The loose steps wait a moment for the answer, which can come just after.
  if (next.loose.length && next.looseEndedAt === null) next = { ...next, looseEndedAt: now };
  return next.answered.length ? { ...next, answered: [] } : next;
}

/**
 * The stream came back and the agent turned out not to be at work: the turns it was writing ended
 * while the stream was down. They end as above; their answer, if one was missed, comes with the
 * thread asked for again (`answerInThread`). A turn that answers no message of its own can't be
 * matched to its answer that way, so it goes, and so do loose steps.
 */
export function turnsOverAfterReconnect(drafts: Drafts): Drafts {
  let next = turnsOver(drafts);
  // Loose steps can't be matched to an answer that comes with the thread asked for again.
  if (next.loose.length) next = { ...next, ...NO_LOOSE };
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

/**
 * One line of a trail: a step, or the same step done several times in a row, with how many times
 * ("Read a web page ×16"). `step` is the last of them (its crew lines go under the line); `first` is
 * where the first of them is in the turn's steps, which names the line while more join it.
 */
export type TrailEntry = { step: DraftStep; times: number; first: number };

/** Whether `next` repeats `step`: the same words, said the same way, with no crew line under `step` between them. */
const repeats = (step: DraftStep, next: DraftStep) =>
  step.progress.length === 0 && Boolean(step.action) === Boolean(next.action) && stepLine(step.text) !== "" && stepLine(step.text) === stepLine(next.text);

/** A turn's steps as the trail's lines: steps one after another that say the same thing are one line, with a count. */
export function trailEntries(steps: readonly DraftStep[]): TrailEntry[] {
  const entries: TrailEntry[] = [];
  steps.forEach((step, index) => {
    const last = entries[entries.length - 1];
    if (last && repeats(last.step, step)) entries[entries.length - 1] = { step, times: last.times + 1, first: last.first };
    else entries.push({ step, times: 1, first: index });
  });
  return entries;
}

/**
 * Which lines are on screen: the last `STEPS_SHOWN`, or all of them once asked for (`all`). `earlier`
 * is how many steps come before those last lines, whether they are shown or folded: the trail's
 * "+N earlier steps" while folded, and what "Hide earlier steps" folds again once shown.
 */
export function stepsToShow(steps: readonly DraftStep[], all: boolean): { shown: readonly TrailEntry[]; earlier: number } {
  const entries = trailEntries(steps);
  if (entries.length <= STEPS_SHOWN) return { shown: entries, earlier: 0 };
  const last = entries.slice(-STEPS_SHOWN);
  return { shown: all ? entries : last, earlier: last[0].first };
}

/** A step as one short line: what Tex did or wrote, or, for the crew at work alone, its latest line ("Scout: reading 4 pages"). */
export function stepLabel(step: DraftStep): string {
  const text = stepLine(step.text);
  if (text) return text;
  const last = step.progress[step.progress.length - 1];
  return last ? `${last.name}: ${last.text}` : "";
}

/**
 * The one line an answer carries about its turn: the last thing Tex did (its last own step; else the
 * last step), and how many steps there were. "Checked your inbox · 2 steps".
 */
export function trailLine(steps: readonly DraftStep[]): string {
  const headline = [...steps].reverse().find((step) => step.action) ?? [...steps].reverse().find((step) => stepLabel(step));
  const count = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  const label = headline ? stepLabel(headline) : "";
  return label ? `${label} · ${count}` : count;
}
