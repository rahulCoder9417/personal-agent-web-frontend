import { describe, expect, it } from "vitest";
import type { Automation, AutomationRun } from "./api/client";
import { editorFrom, emptyEditor, firstProblemKey, previewSource, problemsByStep, toOneInstruction, toParts, toStepped, EDITOR_TEMPLATES } from "./automation-editor";
import { automationFlow, changedSteps, stepKey } from "./automation-flow";
import {
  acknowledgeCondition,
  canAddStep,
  conditionLabel,
  conditionWarnings,
  editorStepsFrom,
  emptyStep,
  insertStep,
  MAX_STEPS,
  moveStep,
  previewSteps,
  removeStep,
  runSummary,
  runTrail,
  stepsCostLine,
  toStepInputs,
  type EditorStep,
} from "./automation-steps";
import { laneDiagram, stepLanes } from "./automation-lanes";
import { laneLayout } from "./lane-layout";

// Automations with steps (phase 4): the list's editing and its warning, what is sent, the server's
// problems by step, the flow and its lanes on the canvas, the cost line and the last run's trail.

const NOW = new Date("2026-10-01T14:30:00");
const priya = () => EDITOR_TEMPLATES.find((template) => template.id === "urgent-boss-mail")!.fill(emptyEditor("Asia/Kolkata", NOW));
const ids = (steps: readonly EditorStep[]) => steps.map((step) => step.id);

describe("editing the list of steps", () => {
  it("adds at a place, removes, moves; at 6 nothing more is added", () => {
    let steps = priya().steps;
    expect(ids(steps)).toEqual(["fetch", "pick", "draft", "send"]);
    steps = insertStep(steps, 1, emptyStep("tex", "new"));
    expect(ids(steps)).toEqual(["fetch", "new", "pick", "draft", "send"]);
    steps = moveStep(steps, "new", 1);
    expect(ids(steps)).toEqual(["fetch", "pick", "new", "draft", "send"]);
    expect(ids(moveStep(steps, "fetch", -1))).toEqual(ids(steps));
    steps = insertStep(steps, 99, emptyStep("tex", "six"));
    expect(steps).toHaveLength(MAX_STEPS);
    expect(canAddStep(steps)).toBe(false);
    expect(insertStep(steps, 0, emptyStep("tex", "seven"))).toHaveLength(MAX_STEPS);
    expect(ids(removeStep(steps, "new"))).toEqual(["fetch", "pick", "draft", "send", "six"]);
  });

  it("a condition that now looks at another step is flagged until looked at again", () => {
    const steps = priya().steps;
    expect(conditionWarnings(steps).size).toBe(0);
    // Step 2 ("pick") removed: "draft" now follows "fetch", and its "mentions" looks at step 1.
    const removed = removeStep(steps, "pick");
    expect(conditionWarnings(removed)).toEqual(new Map([["draft", "Check this: it now looks at step 1."]]));
    expect(conditionWarnings(acknowledgeCondition(removed, "draft")).size).toBe(0);
    // Moving a step with a condition above another flags it too; a step without one isn't.
    expect([...conditionWarnings(moveStep(steps, "draft", -1)).keys()]).toEqual(["draft", "pick"]);
  });

  it("sends each step with its id; step 1 never has a condition; a risky action asks first; words split", () => {
    const sent = toStepInputs(priya().steps);
    expect(sent[0]).toMatchObject({ id: "fetch", type: "action", app: "gmail", action: "GMAIL_FETCH_EMAILS", onlyIf: { kind: "always" }, inputs: { query: "from:boss@acme.com is:unread newer_than:1d" } });
    expect(sent[2]).toMatchObject({ id: "draft", type: "tex", onlyIf: { kind: "mentions", words: ["urgent"] }, showResult: true });
    expect(sent[3]).toMatchObject({ id: "send", askFirst: true });
    const moved = toStepInputs(moveStep(priya().steps, "pick", -1));
    expect(moved[0]).toMatchObject({ id: "pick", onlyIf: { kind: "always" } });
    const parts = toParts(priya());
    expect(parts.apps).toBeUndefined();
    expect(parts.steps).toHaveLength(4);
  });

  it("one instruction into steps and back loses nothing", () => {
    const one = { ...emptyEditor("UTC", NOW), title: "Brief", instruction: "Brief me on my day\nwith meetings", apps: ["gmail", "googlecalendar"], mode: "schedule" as const };
    const stepped = toStepped(one, () => 0.5);
    expect(stepped.instruction).toBe("Brief me on my day");
    expect(stepped.steps).toHaveLength(1);
    expect(stepped.steps[0]).toMatchObject({ type: "tex", instruction: "Brief me on my day\nwith meetings", readApps: ["gmail", "googlecalendar"] });
    const back = toOneInstruction(stepped);
    expect(back.steps).toEqual([]);
    expect(back.instruction).toContain("with meetings");
    expect(back.apps).toEqual(["gmail", "googlecalendar"]);
  });
});

describe("the server's problems, by step", () => {
  it("each step's problem on its box; the list's own above; the first opens", () => {
    const problems = [
      { step: "steps" as const, stepId: "send", code: "invalid" as const, message: "Step 4: Gmail is not connected." },
      { step: "steps" as const, stepId: null, code: "invalid" as const, message: "An automation has up to 6 steps." },
      { step: "trigger" as const, stepId: null, code: "past" as const, message: "That moment has passed." },
    ];
    const read = problemsByStep(problems);
    expect(read.byStepId.get("send")).toEqual(["Step 4: Gmail is not connected."]);
    expect(read.stepsList).toEqual(["An automation has up to 6 steps."]);
    expect(read.byStep.get("trigger")).toEqual(["That moment has passed."]);
    expect(firstProblemKey(problems)).toBe("step:send");
    // An older backend sends no stepId: a box problem reads as before.
    expect(problemsByStep([{ step: "apps", code: "invalid", message: "x" }]).byStep.get("apps")).toEqual(["x"]);
  });
});

describe("the flow of an automation with steps", () => {
  const saved: Automation = {
    id: "aut_1",
    kind: "repeat",
    title: "Urgent mail from my boss",
    instruction: "Reply fast to urgent mail from my boss",
    cron: "0 8 * * 1-5",
    timezone: "Asia/Kolkata",
    enabled: true,
    pausedReason: null,
    nextRunAt: null,
    lastRunAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    copyTo: null,
    steps: previewSteps(priya().steps),
  };

  it("is the trigger, each step and the results, with conditions on the arrows", () => {
    const flow = automationFlow(saved, "Asia/Kolkata", NOW);
    expect(flow.map((box) => box.key)).toEqual(["trigger", "step:fetch", "step:pick", "step:draft", "step:send", "results"]);
    expect(flow[1].label).toBe("Step 1 · Gmail");
    expect(flow[2].step?.condition).toBe("only if: the step before found something");
    expect(flow[3].step?.condition).toBe("only if: mentions “urgent”");
    expect(flow[4].step).toMatchObject({ askFirst: true, locked: true });
    expect(conditionLabel({ kind: "tex", question: "Is any urgent?" }, 1)).toBe("only if Tex says yes: “Is any urgent?”");
    // An automation made before steps keeps its five boxes.
    expect(automationFlow({ ...saved, steps: [] }, "UTC", NOW).map((box) => box.key)).toEqual(["trigger", "instruction", "apps", "asks", "results"]);
  });

  it("a change marks the steps set differently, by id (a moved step whose settings are the same is not)", () => {
    const editor = editorFrom(saved, "Asia/Kolkata", NOW);
    const edited = { ...editor, steps: editor.steps.map((step) => (step.id === "draft" ? { ...step, instruction: "Draft one line." } : step)) };
    expect([...changedSteps(previewSource(edited), saved)]).toEqual([stepKey("draft")]);
    const moved = { ...editor, steps: moveStep(editor.steps, "send", -1) };
    expect(changedSteps(previewSource(moved), saved).has(stepKey("draft"))).toBe(false);
  });

  it("lays it out top to bottom in its lanes (read, Tex, write), with room on the line into each step with an “only if”", () => {
    const editor = editorFrom(saved, "Asia/Kolkata", NOW);
    const lanes = stepLanes(editor.steps, (_app, action) => (action === "GMAIL_SEND_EMAIL" ? true : action === "GMAIL_FETCH_EMAILS" ? false : undefined));
    expect(lanes).toEqual(["read", "tex", "tex", "write"]);
    const diagram = laneDiagram(editor.steps, lanes);
    expect(diagram.mode).toBe("lanes");
    const placed = laneLayout(diagram, new Map(), new Set(["step:pick", "step:draft"]));
    const ys = diagram.items.map((item) => placed.boxes.get(item.key)!.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(placed.gaps.get("step:fetch->step:pick")!.conditionY).not.toBeNull();
    expect(placed.gaps.get("step:draft->step:send")!.conditionY).toBeNull();
  });

  it("says what the app actions can cost", () => {
    const steps = previewSteps(priya().steps);
    expect(stepsCostLine(steps, () => undefined)).toBe("At most 1 credit per “Send email” done, plus AI and awake time. Still looking up the other actions.");
    expect(stepsCostLine(steps.filter((step) => step.type === "tex"), () => undefined)).toMatch(/^Tex steps only read/);
  });
});

describe("the last run's trail", () => {
  const run: AutomationRun = {
    id: "arn_1",
    automationId: "aut_1",
    state: "stopped",
    test: false,
    currentStepId: null,
    stopReason: "Nothing to do: step 2 runs only if step 1 found something, and it didn't.",
    steps: [
      { stepId: "fetch", number: 1, title: "Fetch", state: "done", result: "[]", reason: null, tries: 1, approvalId: null },
      { stepId: "pick", number: 2, title: "Pick", state: "skipped", result: null, reason: "Its “only if” was false.", tries: 0, approvalId: null },
      { stepId: "send", number: 3, title: "Send", state: "pending", result: null, reason: null, tries: 0, approvalId: null },
    ],
    resultsRemoved: false,
    startedAt: "2026-10-01T08:00:00",
    endedAt: "2026-10-01T08:01:00",
  };

  it("marks each step and sums the run up in a line", () => {
    const trail = runTrail(run);
    expect(trail.get("fetch")).toEqual({ label: "Done", tone: "done" });
    expect(trail.get("pick")).toEqual({ label: "Skipped: Its “only if” was false.", tone: "muted" });
    expect(trail.get("send")).toEqual({ label: "Not reached", tone: "muted" });
    expect(runSummary(run, NOW).line).toBe("Last run, 6h ago: stopped: Nothing to do: step 2 runs only if step 1 found something, and it didn't.");
    const waiting = { ...run, state: "waiting" as const, currentStepId: "send", steps: run.steps.map((step) => (step.stepId === "send" ? { ...step, state: "waiting" as const } : step)) };
    expect(runTrail(waiting).get("send")).toEqual({ label: "Waiting for your OK", tone: "waiting" });
    expect(runSummary(waiting, NOW).line).toMatch(/waiting for your OK on step 3/);
  });

  it("an automation's saved steps start the editor with each condition looked at", () => {
    const steps = editorStepsFrom(previewSteps(priya().steps));
    expect(conditionWarnings(steps).size).toBe(0);
    expect(steps[3]).toMatchObject({ risky: true, askFirst: true });
  });
});
