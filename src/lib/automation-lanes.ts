// Every automation has one shape on the canvas, top to bottom:
//
//   Start when → Read from an app (optional) → Tex and the crew → Write or send (optional) → Results
//
// The API keeps an automation's steps as one flat list, in the order they run (`AutomationStep`, at
// most 6). This file maps that list to the lanes and back, with nothing lost and no order changed:
//
// - an app step whose action only reads (`AppAction.changesSomething` false) is a read, one that
//   changes something is a write, and a Tex step belongs to Tex's lane;
// - the list fits the lanes when its reads come first, then the Tex steps, then the writes;
// - a list that doesn't fit (Tex, then a read, then Tex again: older automations, or ones Tex
//   drafted) is shown as it is, in the order it runs, in one lane ("mixed"): nothing is moved
//   unless the person asks for it (`sortIntoLanes`), since moving a step changes what each
//   "only if" looks at.
//
// It also says where a new step can go (each gap between two boxes, by lane: what lights up while a
// block is dragged), what a click on a block adds, which steps can be removed, skipping a lane, and
// the four shapes a new automation can start from. Nothing here draws.

import type { EditorParts } from "./automation-editor";
import { emptyStep, insertStep, MAX_STEPS, moveStep, newStepId, removeStep, type EditorStep } from "./automation-steps";

export type Lane = "read" | "tex" | "write";
export const LANES: readonly Lane[] = ["read", "tex", "write"];

/** Where each lane sits, top to bottom. The trigger is above them all, the results below. */
const ORDER: Record<Lane, number> = { read: 0, tex: 1, write: 2 };
const START = -1;
const END = 3;

export const LANE_TITLE: Record<Lane, string> = { read: "Read from an app", tex: "Tex and the crew", write: "Write or send" };

/** Whether an app's action changes something (`AppAction.changesSomething`); undefined while its list isn't in, or when it isn't on it. */
export type ChangesLookup = (app: string, action: string) => boolean | undefined;

type LaneStep = Pick<EditorStep, "type" | "app" | "action" | "risky" | "lane">;

/**
 * A step's lane when it can be told: a Tex step is Tex's; an app step by what its action does, as
 * its app's list says; else a risky one (it sends, deletes or pays) writes; else the lane it was
 * put in on the canvas. Null when none of these says.
 */
export function knownLane(step: LaneStep, changes: ChangesLookup): Lane | null {
  if (step.type === "tex") return "tex";
  if (step.app && step.action) {
    const changing = changes(step.app, step.action);
    if (changing !== undefined) return changing ? "write" : "read";
  }
  if (step.risky) return "write";
  return step.lane ?? null;
}

/**
 * Each step's lane. One that can't be told yet (its app's list is still loading, or its action is
 * not on it) takes the lane that keeps the saved order: a write once a Tex step or a write has come
 * before it, a read before that.
 */
export function stepLanes(steps: readonly LaneStep[], changes: ChangesLookup): Lane[] {
  const known = steps.map((step) => knownLane(step, changes));
  return known.map((lane, index) => {
    if (lane) return lane;
    return known.slice(0, index).some((before) => before === "tex" || before === "write") ? "write" : "read";
  });
}

/** Whether the lanes run read, then Tex, then write (an empty list fits). */
export function fitsLanes(lanes: readonly Lane[]): boolean {
  return lanes.every((lane, index) => index === 0 || ORDER[lanes[index - 1]] <= ORDER[lane]);
}

/** How the canvas shows the steps: in their lanes, or (a list that doesn't fit) in the order they run. */
export type LaneMode = "lanes" | "mixed";

export function laneMode(lanes: readonly Lane[]): LaneMode {
  return fitsLanes(lanes) ? "lanes" : "mixed";
}

/** The places in the list of the steps of one lane. */
export function laneIndexes(lanes: readonly Lane[], lane: Lane): number[] {
  return lanes.flatMap((item, index) => (item === lane ? [index] : []));
}

/**
 * Where a step put at the end of `lane` goes in the list: after the lane's last step, or, when the
 * lane is empty, before the first step of a lane below it.
 */
export function endOfLane(lanes: readonly Lane[], lane: Lane): number {
  const own = laneIndexes(lanes, lane);
  if (own.length) return own[own.length - 1] + 1;
  const below = lanes.findIndex((item) => ORDER[item] > ORDER[lane]);
  return below === -1 ? lanes.length : below;
}

/** Where a step put at place `at` of `lane` (0 is its first) goes in the list, when the steps fit the lanes. */
export function laneToIndex(lanes: readonly Lane[], lane: Lane, at: number): number {
  const before = lanes.filter((item) => ORDER[item] < ORDER[lane]).length;
  const count = laneIndexes(lanes, lane).length;
  return before + Math.max(0, Math.min(at, count));
}

// ---------------------------------------------------------------- the boxes, top to bottom

/** One box on the canvas, top to bottom. */
export type LaneItem =
  | { kind: "trigger"; key: "trigger" }
  /** A step of the list (`index` is its place in it). */
  | { kind: "step"; key: string; index: number; lane: Lane }
  /** One instruction and no steps ("Just Tex"): Tex's box is the instruction. */
  | { kind: "instruction"; key: "instruction"; lane: "tex" }
  /** An empty lane: reading or writing skipped, or no Tex step. A block can be dropped on it. */
  | { kind: "empty"; key: `empty:${Lane}`; lane: Lane }
  | { kind: "results"; key: "results" };

/** One place a step can be put: in `lane`, at `at` of that lane, which is `index` of the list. */
export type Insert = { lane: Lane; at: number; index: number };

/** The line between two boxes, and the places on it a new step can go. */
export type LaneGap = { id: string; from: string; to: string; inserts: Insert[] };

/** The name above a lane's first box ("READ · OPTIONAL"), and whether it offers to skip the lane. */
export type LaneHead = { lane: Lane | "start" | "steps"; before: string; skip: boolean };

export type LaneDiagram = {
  mode: LaneMode;
  items: LaneItem[];
  gaps: LaneGap[];
  heads: LaneHead[];
  /** The lanes the inserts count in: the steps', or for one instruction its one Tex step to be (`toStepped`). */
  lanes: Lane[];
};

/** The lanes a step put in counts against: one instruction counts as its one Tex step. */
export function virtualLanes(steps: readonly unknown[], lanes: readonly Lane[]): Lane[] {
  return steps.length === 0 ? ["tex"] : [...lanes];
}

export const stepKeyOf = (step: Pick<EditorStep, "id">) => `step:${step.id}`;

function placeOf(item: LaneItem): number {
  if (item.kind === "trigger") return START;
  if (item.kind === "results") return END;
  return ORDER[item.lane];
}

/**
 * The boxes of an automation on the canvas, top to bottom, the lines between them, and the names
 * over the lanes. With no steps (one instruction) Tex's box is the instruction. In `mixed` mode the
 * steps are one lane, in the order they run, and a step of any kind can go between any two.
 *
 * On a line between two boxes a step of a lane can go when the lane sits between them (a read
 * between the trigger and the first read, a Tex step or a write between the last Tex step and the
 * first write). An empty lane is a box of its own, and the place its first step goes.
 */
export function laneDiagram(steps: readonly Pick<EditorStep, "id">[], lanes: readonly Lane[]): LaneDiagram {
  const mode = laneMode(lanes);
  const items: LaneItem[] = [{ kind: "trigger", key: "trigger" }];
  const heads: LaneHead[] = [{ lane: "start", before: "trigger", skip: false }];
  const stepItem = (index: number): LaneItem => ({ kind: "step", key: stepKeyOf(steps[index]), index, lane: lanes[index] });

  if (mode === "mixed") {
    steps.forEach((_, index) => items.push(stepItem(index)));
    if (steps.length) heads.push({ lane: "steps", before: items[1].key, skip: false });
  } else {
    for (const lane of LANES) {
      const own = laneIndexes(lanes, lane);
      const first = own.length
        ? stepItem(own[0])
        : lane === "tex" && steps.length === 0
          ? ({ kind: "instruction", key: "instruction", lane: "tex" } as const)
          : ({ kind: "empty", key: `empty:${lane}`, lane } as const);
      heads.push({ lane, before: first.key, skip: lane !== "tex" && own.length > 0 });
      items.push(first);
      own.slice(1).forEach((index) => items.push(stepItem(index)));
    }
  }
  items.push({ kind: "results", key: "results" });

  // The list as it would be after one instruction became its first step (`toStepped`): a step put
  // around Tex's box goes before or after it.
  const virtual = virtualLanes(steps, lanes);
  const gaps: LaneGap[] = [];
  let index = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const from = items[i];
    const to = items[i + 1];
    if (from.kind === "step" || from.kind === "instruction") index++;
    const inserts: Insert[] = [];
    if (mode === "mixed") {
      for (const lane of LANES) inserts.push({ lane, at: index, index });
    } else {
      for (const lane of LANES) {
        const place = ORDER[lane];
        if (place < placeOf(from) || place > placeOf(to)) continue;
        // An empty lane's box is where its first step goes, not the lines beside it.
        if ((from.kind === "empty" && from.lane === lane) || (to.kind === "empty" && to.lane === lane)) continue;
        const at = virtual.slice(0, index).filter((item) => item === lane).length;
        inserts.push({ lane, at, index });
      }
    }
    gaps.push({ id: `${from.key}->${to.key}`, from: from.key, to: to.key, inserts });
  }
  return { mode, items, gaps, heads, lanes: virtual };
}

/** What a block put in an empty lane's box inserts. */
export function emptyLaneInsert(lanes: readonly Lane[], lane: Lane): Insert {
  return { lane, at: 0, index: endOfLane(lanes, lane) };
}

/**
 * The places a block of `lane` can be dropped while it is dragged: the lines that take it, and its
 * lane's box when the lane is empty. None at 6 steps. A trigger block has none of these: it goes on
 * the trigger.
 */
export type DropZone = { key: string; insert: Insert };

export function dropZones(diagram: LaneDiagram, lane: Lane, count: number): DropZone[] {
  if (count >= MAX_STEPS) return [];
  const zones: DropZone[] = [];
  for (const item of diagram.items) {
    if (item.kind === "empty" && item.lane === lane) zones.push({ key: item.key, insert: emptyLaneInsert(diagram.lanes, lane) });
  }
  for (const gap of diagram.gaps) {
    const insert = gap.inserts.find((item) => item.lane === lane);
    if (insert) zones.push({ key: gap.id, insert });
  }
  return zones;
}

// ---------------------------------------------------------------- changing the list

/** How many steps the canvas shows ("3 of 6 steps"): one instruction is Tex's one box. */
export function shownStepCount(steps: readonly unknown[]): number {
  return Math.max(1, steps.length);
}

/**
 * Whether the × on a step's box removes it: an app step always; a Tex step while another is left
 * (Tex's lane is the middle of every automation, so its last step stays).
 */
export function canRemoveStep(steps: readonly Pick<EditorStep, "id" | "type">[], id: string): boolean {
  const step = steps.find((item) => item.id === id);
  if (!step) return false;
  return step.type === "action" || steps.filter((item) => item.type === "tex").length > 1;
}

/** The list without a lane's steps: "Skip reading", "Skip writing". */
export function skipLane<T extends EditorStep>(steps: readonly T[], lanes: readonly Lane[], lane: "read" | "write"): T[] {
  return steps.filter((_, index) => lanes[index] !== lane);
}

/**
 * Whether a step can move one place up (-1) or down (1). In the lanes it stays in its own lane; in
 * the order they run (mixed) it can go anywhere.
 */
export function canMoveStep(lanes: readonly Lane[], index: number, by: -1 | 1): boolean {
  const to = index + by;
  if (index < 0 || to < 0 || to >= lanes.length) return false;
  return laneMode(lanes) === "mixed" || lanes[to] === lanes[index];
}

/** A step moved one place, if it may (`canMoveStep`). */
export function moveWithinLane<T extends EditorStep>(steps: readonly T[], lanes: readonly Lane[], id: string, by: -1 | 1): T[] {
  const index = steps.findIndex((step) => step.id === id);
  if (!canMoveStep(lanes, index, by)) return [...steps];
  return moveStep(steps, id, by) as T[];
}

/**
 * A list that doesn't fit, put into the lanes: the reads first, then the Tex steps, then the
 * writes, each lane in the order it had. Only when the person asks: the step before an "only if"
 * may change, and then that condition shows its warning until it is looked at.
 */
export function sortIntoLanes<T extends EditorStep>(steps: readonly T[], lanes: readonly Lane[]): T[] {
  return steps
    .map((step, index) => ({ step, index, lane: lanes[index] }))
    .sort((a, b) => ORDER[a.lane] - ORDER[b.lane] || a.index - b.index)
    .map((item) => item.step);
}

/**
 * The parts with a step put at `index` of the list. One instruction becomes its first step first
 * (`toStepped`, given by the caller, so this file needs nothing of the editor's), so a step can go
 * before or after it. At 6 steps nothing changes, and `added` is false.
 */
export function addStepAt(
  editor: EditorParts,
  index: number,
  step: EditorStep,
  toStepped: (editor: EditorParts) => EditorParts,
): { editor: EditorParts; added: boolean } {
  const base = editor.steps.length ? editor : toStepped(editor);
  if (base.steps.length >= MAX_STEPS) return { editor, added: false };
  return { editor: { ...base, steps: insertStep(base.steps, index, step) }, added: true };
}

/** The parts without a step. The last one gone, it runs as one instruction again (the purpose is its instruction). */
export function removeStepFrom(editor: EditorParts, id: string): EditorParts {
  return { ...editor, steps: removeStep(editor.steps, id) };
}

// ---------------------------------------------------------------- the four shapes

export type ShapeId = "read-act" | "read-tell" | "write" | "just-tex";

export type Shape = {
  id: ShapeId;
  title: string;
  /** In a line: what it skips, and an example. */
  blurb: string;
  read: boolean;
  write: boolean;
};

/** The four ways to start a new automation on the canvas: with or without reading, with or without writing. */
export const SHAPES: readonly Shape[] = [
  { id: "read-act", title: "Read, decide, then act", blurb: "“When an email arrives, email me if it’s urgent.”", read: true, write: true },
  { id: "read-tell", title: "Read and tell me", blurb: "Skips writing. “Every morning, summarise my unread email.”", read: true, write: false },
  { id: "write", title: "Write without reading", blurb: "Skips reading. “Every Monday, write the team update and email it.”", read: false, write: true },
  { id: "just-tex", title: "Just Tex", blurb: "Skips both. “Remind me every Friday at 5 to send the report.”", read: false, write: false },
];

export function findShape(id: string | null | undefined): Shape | null {
  return SHAPES.find((shape) => shape.id === id) ?? null;
}

/**
 * The steps a shape starts with: an app step to pick in each lane it has, around one Tex step.
 * "Just Tex" has none: one instruction.
 */
export function shapeSteps(shape: Shape, random?: () => number): EditorStep[] {
  if (!shape.read && !shape.write) return [];
  const ids: string[] = [];
  const id = () => {
    const next = newStepId(ids, random);
    ids.push(next);
    return next;
  };
  const steps: EditorStep[] = [];
  if (shape.read) steps.push({ ...emptyStep("action", id()), lane: "read" });
  steps.push(emptyStep("tex", id(), steps[steps.length - 1]?.id ?? null));
  if (shape.write) steps.push({ ...emptyStep("action", id(), steps[steps.length - 1].id), lane: "write" });
  return steps;
}
