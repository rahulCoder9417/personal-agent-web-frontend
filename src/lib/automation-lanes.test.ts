import { describe, expect, it } from "vitest";
import { emptyEditor, toParts, toStepped } from "./automation-editor";
import {
  addStepAt,
  canMoveStep,
  canRemoveStep,
  dropZones,
  emptyLaneInsert,
  endOfLane,
  fitsLanes,
  knownLane,
  laneDiagram,
  laneMode,
  laneToIndex,
  moveWithinLane,
  removeStepFrom,
  SHAPES,
  shapeSteps,
  shownStepCount,
  skipLane,
  sortIntoLanes,
  stepLanes,
  type ChangesLookup,
  type Lane,
} from "./automation-lanes";
import { conditionWarnings, emptyStep, MAX_STEPS, type EditorStep } from "./automation-steps";

// What the apps' lists say: fetching reads, sending and drafting change something.
const CHANGES: Record<string, boolean> = { GMAIL_FETCH_EMAILS: false, GITHUB_LIST_PULL_REQUESTS: false, GMAIL_SEND_EMAIL: true, GMAIL_CREATE_EMAIL_DRAFT: true };
const changes: ChangesLookup = (_app, action) => CHANGES[action];
const nothingKnown: ChangesLookup = () => undefined;

const read = (id: string, action = "GMAIL_FETCH_EMAILS"): EditorStep => ({ ...emptyStep("action", id), app: "gmail", action });
const write = (id: string, action = "GMAIL_SEND_EMAIL", risky = true): EditorStep => ({ ...emptyStep("action", id), app: "gmail", action, risky, askFirst: risky });
const tex = (id: string, instruction = "Sum it up"): EditorStep => ({ ...emptyStep("tex", id), instruction });

const lanesOf = (steps: EditorStep[], lookup = changes) => stepLanes(steps, lookup);

describe("a step's lane", () => {
  it("is Tex's for a Tex step, and an app step's by what its action does", () => {
    expect(knownLane(tex("a"), changes)).toBe("tex");
    expect(knownLane(read("a"), changes)).toBe("read");
    expect(knownLane(write("a", "GMAIL_CREATE_EMAIL_DRAFT", false), changes)).toBe("write");
  });

  it("follows the action's list over the lane it was put in, and a risky step writes", () => {
    expect(knownLane({ ...read("a"), lane: "write" }, changes)).toBe("read");
    expect(knownLane({ ...emptyStep("action", "a"), app: "gmail", action: "X_UNKNOWN", risky: true }, changes)).toBe("write");
    expect(knownLane({ ...emptyStep("action", "a"), lane: "write" }, changes)).toBe("write");
    expect(knownLane(emptyStep("action", "a"), changes)).toBeNull();
  });

  it("while the lists load, keeps the saved order: a read until a Tex step or a write came before", () => {
    const steps = [read("a"), tex("b"), write("c", "GMAIL_CREATE_EMAIL_DRAFT", false), read("d")];
    expect(lanesOf(steps, nothingKnown)).toEqual(["read", "tex", "write", "write"]);
    expect(lanesOf([read("a"), read("b")], nothingKnown)).toEqual(["read", "read"]);
    // A risky one is a write even before its list is in.
    expect(lanesOf([read("a"), write("b")], nothingKnown)).toEqual(["read", "write"]);
  });
});

describe("whether the saved order fits the lanes", () => {
  it("fits when the reads come first, then Tex, then the writes", () => {
    expect(fitsLanes([])).toBe(true);
    expect(fitsLanes(["read", "read", "tex", "write"])).toBe(true);
    expect(fitsLanes(["tex", "write", "write"])).toBe(true);
    expect(fitsLanes(["tex", "read", "tex"])).toBe(false);
    expect(fitsLanes(["write", "tex"])).toBe(false);
    expect(laneMode(["tex", "read", "tex"])).toBe("mixed");
  });

  it("puts a step in a lane at the right place of the flat list", () => {
    const lanes: Lane[] = ["read", "tex", "tex", "write"];
    expect(laneToIndex(lanes, "read", 0)).toBe(0);
    expect(laneToIndex(lanes, "read", 1)).toBe(1);
    expect(laneToIndex(lanes, "tex", 2)).toBe(3);
    expect(laneToIndex(lanes, "write", 1)).toBe(4);
    expect(laneToIndex(lanes, "write", 9)).toBe(4);
    expect(endOfLane(lanes, "tex")).toBe(3);
    expect(endOfLane(["tex", "write"], "read")).toBe(0);
    expect(endOfLane(["read", "tex"], "write")).toBe(2);
  });
});

describe("the boxes, top to bottom", () => {
  it("draws read, Tex and write in their lanes, with an empty lane as its own box", () => {
    const steps = [read("a"), tex("b"), write("c")];
    const diagram = laneDiagram(steps, lanesOf(steps));
    expect(diagram.mode).toBe("lanes");
    expect(diagram.items.map((item) => item.key)).toEqual(["trigger", "step:a", "step:b", "step:c", "results"]);
    expect(diagram.heads.map((head) => [head.lane, head.before, head.skip])).toEqual([
      ["start", "trigger", false],
      ["read", "step:a", true],
      ["tex", "step:b", false],
      ["write", "step:c", true],
    ]);

    const skipped = laneDiagram([tex("b")], ["tex"]);
    expect(skipped.items.map((item) => item.key)).toEqual(["trigger", "empty:read", "step:b", "empty:write", "results"]);
    expect(skipped.heads.filter((head) => head.skip)).toEqual([]);
  });

  it("draws one instruction (no steps) as Just Tex: the trigger, then Tex's box with the instruction", () => {
    const diagram = laneDiagram([], []);
    expect(diagram.items.map((item) => item.key)).toEqual(["trigger", "empty:read", "instruction", "empty:write", "results"]);
    expect(diagram.lanes).toEqual(["tex"]);
  });

  it("says, on each line, which lanes a new step can go in, and where", () => {
    const steps = [read("a"), tex("b"), write("c")];
    const diagram = laneDiagram(steps, lanesOf(steps));
    const inserts = Object.fromEntries(diagram.gaps.map((gap) => [gap.id, gap.inserts.map((insert) => `${insert.lane}:${insert.at}@${insert.index}`)]));
    expect(inserts).toEqual({
      "trigger->step:a": ["read:0@0"],
      "step:a->step:b": ["read:1@1", "tex:0@1"],
      "step:b->step:c": ["tex:1@2", "write:0@2"],
      "step:c->results": ["write:1@3"],
    });
  });

  it("keeps the lines beside an empty lane for the lanes around it, and Just Tex's around the instruction", () => {
    const diagram = laneDiagram([], []);
    const inserts = Object.fromEntries(diagram.gaps.map((gap) => [gap.id, gap.inserts.map((insert) => `${insert.lane}:${insert.at}@${insert.index}`)]));
    expect(inserts).toEqual({
      "trigger->empty:read": [],
      "empty:read->instruction": ["tex:0@0"],
      "instruction->empty:write": ["tex:1@1"],
      "empty:write->results": [],
    });
    // A read goes before the instruction's step, a write after it.
    expect(emptyLaneInsert(diagram.lanes, "read")).toEqual({ lane: "read", at: 0, index: 0 });
    expect(emptyLaneInsert(diagram.lanes, "write")).toEqual({ lane: "write", at: 0, index: 1 });
  });

  it("shows a list that doesn't fit in the order it runs, in one lane, with any step anywhere", () => {
    const steps = [tex("a"), read("b"), tex("c")];
    const lanes = lanesOf(steps);
    const diagram = laneDiagram(steps, lanes);
    expect(diagram.mode).toBe("mixed");
    expect(diagram.items.map((item) => item.key)).toEqual(["trigger", "step:a", "step:b", "step:c", "results"]);
    expect(diagram.heads.map((head) => head.lane)).toEqual(["start", "steps"]);
    expect(diagram.gaps[1].inserts.map((insert) => insert.lane)).toEqual(["read", "tex", "write"]);
    expect(diagram.gaps.map((gap) => gap.inserts[0].index)).toEqual([0, 1, 2, 3]);
  });
});

describe("where a dragged block can go", () => {
  it("lights up only the places of its own lane", () => {
    const steps = [read("a"), tex("b"), write("c")];
    const diagram = laneDiagram(steps, lanesOf(steps));
    expect(dropZones(diagram, "read", 3).map((zone) => zone.key)).toEqual(["trigger->step:a", "step:a->step:b"]);
    expect(dropZones(diagram, "tex", 3).map((zone) => zone.key)).toEqual(["step:a->step:b", "step:b->step:c"]);
    expect(dropZones(diagram, "write", 3).map((zone) => zone.key)).toEqual(["step:b->step:c", "step:c->results"]);
  });

  it("takes an empty lane's box for its first step, and nothing at 6 steps", () => {
    const diagram = laneDiagram([tex("b")], ["tex"]);
    expect(dropZones(diagram, "read", 1)).toEqual([{ key: "empty:read", insert: { lane: "read", at: 0, index: 0 } }]);
    expect(dropZones(diagram, "write", 1)).toEqual([{ key: "empty:write", insert: { lane: "write", at: 0, index: 1 } }]);
    expect(dropZones(diagram, "tex", MAX_STEPS)).toEqual([]);
  });
});

describe("changing the steps", () => {
  it("turns one instruction into its first step when a step is added, before or after it", () => {
    const editor = { ...emptyEditor("UTC"), title: "Briefing", instruction: "Sum up my day.", apps: ["gmail"] };
    const random = () => 0;
    const before = addStepAt(editor, 0, read("r"), (e) => toStepped(e, random));
    expect(before.added).toBe(true);
    expect(before.editor.steps.map((step) => step.id)).toEqual(["r", "saaaaaa"]);
    expect(before.editor.steps[1]).toMatchObject({ type: "tex", instruction: "Sum up my day.", readApps: ["gmail"] });
    const after = addStepAt(editor, 1, write("w"), (e) => toStepped(e, random));
    expect(after.editor.steps.map((step) => step.id)).toEqual(["saaaaaa", "w"]);
  });

  it("adds nothing at 6 steps", () => {
    const six = { ...emptyEditor("UTC"), steps: Array.from({ length: MAX_STEPS }, (_, i) => tex(`t${i}`)) };
    const result = addStepAt(six, 2, tex("x"), toStepped);
    expect(result.added).toBe(false);
    expect(result.editor.steps).toHaveLength(MAX_STEPS);
  });

  it("an app step can always be removed, a Tex step while another is left", () => {
    const steps = [read("a"), tex("b"), write("c")];
    expect(canRemoveStep(steps, "a")).toBe(true);
    expect(canRemoveStep(steps, "c")).toBe(true);
    expect(canRemoveStep(steps, "b")).toBe(false);
    expect(canRemoveStep([tex("a"), tex("b")], "a")).toBe(true);
    expect(canRemoveStep(steps, "nope")).toBe(false);
  });

  it("skipping a lane removes its steps and keeps the rest in order", () => {
    const steps = [read("a"), read("b"), tex("c"), write("d")];
    const lanes = lanesOf(steps);
    expect(skipLane(steps, lanes, "read").map((step) => step.id)).toEqual(["c", "d"]);
    expect(skipLane(steps, lanes, "write").map((step) => step.id)).toEqual(["a", "b", "c"]);
  });

  it("the last step gone, it is one instruction again", () => {
    const editor = { ...emptyEditor("UTC"), title: "T", instruction: "Purpose", steps: [read("a")] };
    const next = removeStepFrom(editor, "a");
    expect(next.steps).toEqual([]);
    expect(toParts(next).steps).toBeUndefined();
    expect(toParts(next).instruction).toBe("Purpose");
  });

  it("moves a step within its lane only, unless the steps are shown as they run", () => {
    const steps = [read("a"), read("b"), tex("c"), write("d")];
    const lanes = lanesOf(steps);
    expect(canMoveStep(lanes, 0, 1)).toBe(true);
    expect(canMoveStep(lanes, 1, 1)).toBe(false);
    expect(canMoveStep(lanes, 0, -1)).toBe(false);
    expect(moveWithinLane(steps, lanes, "a", 1).map((step) => step.id)).toEqual(["b", "a", "c", "d"]);
    expect(moveWithinLane(steps, lanes, "b", 1).map((step) => step.id)).toEqual(["a", "b", "c", "d"]);
    const mixed = [tex("a"), read("b"), tex("c")];
    expect(canMoveStep(lanesOf(mixed), 1, 1)).toBe(true);
  });

  it("sorts a list that doesn't fit into the lanes only when asked, each lane in its order, and flags the conditions that now look elsewhere", () => {
    const steps = [tex("a"), read("b"), { ...tex("c"), onlyIf: { kind: "found" as const, words: "", question: "" }, follows: "b" }];
    const sorted = sortIntoLanes(steps, lanesOf(steps));
    expect(sorted.map((step) => step.id)).toEqual(["b", "a", "c"]);
    expect(fitsLanes(lanesOf(sorted))).toBe(true);
    expect([...conditionWarnings(sorted).keys()]).toEqual(["c"]);
    // Nothing is lost.
    expect(new Set(sorted)).toEqual(new Set(steps));
  });

  it("an automation shown as it runs saves with its steps in the same order", () => {
    const steps = [tex("a"), read("b"), tex("c")];
    const editor = { ...emptyEditor("UTC"), title: "T", instruction: "P", mode: "schedule" as const, steps };
    expect(toParts(editor).steps?.map((step) => step.id)).toEqual(["a", "b", "c"]);
  });

  it("counts one instruction as Tex's one step", () => {
    expect(shownStepCount([])).toBe(1);
    expect(shownStepCount([1, 2, 3])).toBe(3);
  });
});

describe("the four shapes", () => {
  it("start with an app step to pick in each lane they have, around one Tex step; Just Tex has none", () => {
    const shape = (id: string) => SHAPES.find((item) => item.id === id)!;
    const kinds = (id: string) => shapeSteps(shape(id)).map((step) => (step.type === "tex" ? "tex" : step.lane));
    expect(kinds("read-act")).toEqual(["read", "tex", "write"]);
    expect(kinds("read-tell")).toEqual(["read", "tex"]);
    expect(kinds("write")).toEqual(["tex", "write"]);
    expect(kinds("just-tex")).toEqual([]);
    const steps = shapeSteps(shape("read-act"));
    expect(new Set(steps.map((step) => step.id)).size).toBe(3);
    expect(fitsLanes(stepLanes(steps, nothingKnown))).toBe(true);
  });
});
