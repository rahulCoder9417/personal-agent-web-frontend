// Automations with steps (phase 4, `../beckend/docs/automations-steps-proposal.md`): up to 6 steps a
// run follows one at a time, in order. A step is an app action (one named action of one connected
// app, with inputs the person fixes) or a Tex instruction (words; Tex only reads in it). Each step
// after the first may have an "only if", checked on the result of the step before: a false one stops
// the run there.
//
// This file is the steps as the canvas holds them (`EditorStep`), the list's editing (add at a place,
// remove, move, at most 6) with the warning a condition gets when the step before it changed, what is
// sent to be checked and saved, the server's problems by step, what the app actions can cost, the
// last run's trail, and which shape the page takes at a width. Nothing here draws, and nothing here
// loads the layout library (that is `step-layout.ts`, on the canvas's own chunk).

import type { AppAction, AutomationRun, AutomationRunStep, AutomationStep, AutomationStepCondition, AutomationStepInput } from "./api/client";
import { formatAgo, listNames, titleCase } from "./format";

/** The most steps an automation can have. */
export const MAX_STEPS = 6;
/** The most apps a Tex step may read. */
export const MAX_READ_APPS = 5;

export type StepType = AutomationStep["type"];
export type ConditionKind = AutomationStepCondition["kind"];

/** One step as the canvas holds it. Text fields are as typed; `toStepInputs` tidies them. */
export type EditorStep = {
  /** Short and unique in the automation (`^[a-z0-9_]{1,24}$`); sent, so problems map to this box before Save. */
  id: string;
  type: StepType;
  /** Left empty: made from the action or the instruction. */
  title: string;
  /** Action step: the app, by slug ("" while none is picked). */
  app: string;
  /** Action step: one action of that app ("GMAIL_SEND_EMAIL"). */
  action: string;
  /** Action step: the inputs the person fixes, by the action's input names. */
  inputs: Record<string, unknown>;
  /** Tex step: what Tex does, in words. */
  instruction: string;
  /** Tex step: the apps Tex may read in it, by slug. */
  readApps: string[];
  /** Action step: wait for the person's yes before it runs. Always on (and locked) for a risky action. */
  askFirst: boolean;
  /** "Only if": `words` as typed, with commas; `question` for "Tex decides". */
  onlyIf: { kind: ConditionKind; words: string; question: string };
  /** "Show me this": its result also goes into the run's answer. */
  showResult: boolean;
  /** Its action sends, deletes or pays, so "ask me first" is locked on (from the server, or the action picked). */
  risky: boolean;
  /**
   * The id of the step before it when its "only if" was last looked at. When the step before is now
   * another one (a step was removed, moved or added), the condition looks at something else, and the
   * box says so until the person looks at it again. Never sent.
   */
  follows: string | null;
  /**
   * An app step put on the canvas in a lane (reading or writing) before its action is known: the
   * lane it stays in while the person picks the app and the action, whose list then offers only
   * the actions of that lane. Never sent; a saved step's lane comes from its action
   * (`automation-lanes.ts`).
   */
  lane?: "read" | "write";
};

// ---------------------------------------------------------------- ids and new steps

const ID_PATTERN = /^[a-z0-9_]{1,24}$/;
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Whether an id is one the contract takes. */
export function isStepId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** A new step id: "s" and six random lower-case letters, not one of `taken`. */
export function newStepId(taken: Iterable<string> = [], random: () => number = Math.random): string {
  const used = new Set(taken);
  for (;;) {
    let id = "s";
    for (let i = 0; i < 6; i++) id += LETTERS[Math.floor(random() * LETTERS.length) % LETTERS.length];
    if (!used.has(id)) return id;
  }
}

const ALWAYS: EditorStep["onlyIf"] = { kind: "always", words: "", question: "" };

/** An empty step of a type. A Tex step shows its result by default (it is usually the words wanted); an action doesn't. */
export function emptyStep(type: StepType, id: string, follows: string | null = null): EditorStep {
  return {
    id,
    type,
    title: "",
    app: "",
    action: "",
    inputs: {},
    instruction: "",
    readApps: [],
    askFirst: false,
    onlyIf: { ...ALWAYS },
    showResult: type === "tex",
    risky: false,
    follows,
  };
}

/** The canvas's steps for an automation's or a draft's saved ones. Each condition starts as looked at. */
export function editorStepsFrom(steps: readonly AutomationStep[] | null | undefined): EditorStep[] {
  return (steps ?? []).map((step, index, all) => ({
    id: step.id,
    type: step.type,
    title: step.title ?? "",
    app: step.app ?? "",
    action: step.action ?? "",
    inputs: { ...(step.inputs ?? {}) },
    instruction: step.instruction ?? "",
    readApps: [...(step.readApps ?? [])],
    askFirst: step.askFirst || step.risky,
    onlyIf: { kind: step.onlyIf?.kind ?? "always", words: (step.onlyIf?.words ?? []).join(", "), question: step.onlyIf?.question ?? "" },
    showResult: step.showResult,
    risky: step.risky,
    follows: index > 0 ? all[index - 1].id : null,
  }));
}

// ---------------------------------------------------------------- editing the list

/** Whether another step can be added. */
export function canAddStep(steps: readonly unknown[]): boolean {
  return steps.length < MAX_STEPS;
}

/**
 * The list with `step` put at `at` (0 is first; the length is the end). At 6 steps, nothing changes.
 * The new step's condition starts as looked at; the step after it now follows the new one, so a
 * condition there shows the warning.
 */
export function insertStep(steps: readonly EditorStep[], at: number, step: EditorStep): EditorStep[] {
  if (!canAddStep(steps)) return [...steps];
  const place = Math.max(0, Math.min(at, steps.length));
  const next = [...steps];
  next.splice(place, 0, { ...step, follows: place > 0 ? steps[place - 1].id : null });
  return next;
}

/** The list without the step `id`. */
export function removeStep(steps: readonly EditorStep[], id: string): EditorStep[] {
  return steps.filter((step) => step.id !== id);
}

/** The list with step `id` moved one place earlier (-1) or later (1). At an end, nothing changes. */
export function moveStep(steps: readonly EditorStep[], id: string, by: -1 | 1): EditorStep[] {
  const from = steps.findIndex((step) => step.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= steps.length) return [...steps];
  const next = [...steps];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** One step changed in place. */
export function replaceStep(steps: readonly EditorStep[], step: EditorStep): EditorStep[] {
  return steps.map((item) => (item.id === step.id ? step : item));
}

/** Whether a step has a condition that counts: any but "always", and not on step 1 (which always runs). */
export function hasCondition(step: Pick<EditorStep, "onlyIf">, index: number): boolean {
  return index > 0 && step.onlyIf.kind !== "always";
}

/**
 * The steps whose "only if" now looks at another step than when it was set: a step was removed,
 * moved or put before it. "Check this: it now looks at step 2." Shown in red until the person looks
 * at the condition again (`acknowledgeCondition`, or any change to it).
 */
export function conditionWarnings(steps: readonly EditorStep[]): Map<string, string> {
  const warnings = new Map<string, string>();
  steps.forEach((step, index) => {
    if (!hasCondition(step, index)) return;
    if (step.follows !== steps[index - 1].id) warnings.set(step.id, `Check this: it now looks at step ${index}.`);
  });
  return warnings;
}

/** The step with its condition marked as looked at, against the step now before it. */
export function acknowledgeCondition(steps: readonly EditorStep[], id: string): EditorStep[] {
  return steps.map((step, index) => (step.id === id ? { ...step, follows: index > 0 ? steps[index - 1].id : null } : step));
}

/** What step 1's panel says when it carries a condition from another place: step 1 always runs. */
export const FIRST_STEP_NOTE = "Step 1 always runs, so it has no “only if”. A condition it had is set aside while it is first.";

// ---------------------------------------------------------------- what is sent

/** The words of a "mentions" condition, as typed with commas: "urgent, asap" → ["urgent", "asap"]. */
export function conditionWords(text: string): string[] {
  return [...new Set(text.split(",").map((word) => word.trim()).filter(Boolean))].slice(0, 10);
}

function conditionOf(step: EditorStep, index: number): AutomationStepCondition {
  if (index === 0) return { kind: "always" };
  switch (step.onlyIf.kind) {
    case "mentions":
      return { kind: "mentions", words: conditionWords(step.onlyIf.words) };
    case "tex":
      return { kind: "tex", question: step.onlyIf.question.trim() };
    case "found":
      return { kind: "found" };
    default:
      return { kind: "always" };
  }
}

/** A fixed input that is set: not left empty. `false` and `0` are set. */
function filledInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(inputs).filter(([, value]) => value !== "" && value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)),
  );
}

/**
 * The steps as check, create, change and a user draft take them: each with its own id (so the
 * server's problems come back on this box), step 1 without a condition, a risky action asking first.
 */
export function toStepInputs(steps: readonly EditorStep[]): AutomationStepInput[] {
  return steps.map((step, index) => {
    const base: AutomationStepInput = {
      id: step.id,
      type: step.type,
      ...(step.title.trim() ? { title: step.title.trim() } : {}),
      onlyIf: conditionOf(step, index),
      showResult: step.showResult,
    };
    if (step.type === "action")
      return { ...base, app: step.app || null, action: step.action || null, inputs: filledInputs(step.inputs), askFirst: step.risky || step.askFirst };
    return { ...base, instruction: step.instruction.trim() || null, readApps: [...new Set(step.readApps)].slice(0, MAX_READ_APPS) };
  });
}

/** The apps the steps name, each once: an action's app, and the apps a Tex step reads. */
export function stepApps(steps: readonly Pick<EditorStep, "type" | "app" | "readApps">[]): string[] {
  const apps = steps.flatMap((step) => (step.type === "action" ? [step.app] : step.readApps)).filter(Boolean);
  return [...new Set(apps)];
}

// ---------------------------------------------------------------- words

/** "GMAIL_SEND_EMAIL" (of gmail) → "Send email". */
export function actionName(action: string, app?: string | null): string {
  let words = action;
  const prefix = app ? `${app.toUpperCase()}_` : null;
  if (prefix && words.toUpperCase().startsWith(prefix)) words = words.slice(prefix.length);
  else if (/^[A-Z0-9]+_/.test(words)) words = words.replace(/^[A-Z0-9]+_/, "");
  const text = words.replace(/[_-]+/g, " ").trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : action;
}

/** A step's title as the box shows it: its own, else the action's name or the instruction's first words. */
export function stepTitle(step: Pick<EditorStep, "title" | "type" | "app" | "action" | "instruction">, actionLabel?: string | null): string {
  if (step.title.trim()) return step.title.trim();
  if (step.type === "action") {
    if (step.action) return actionLabel ?? actionName(step.action, step.app);
    return step.app ? `Pick a ${titleCase(step.app)} action` : "Pick an app and an action";
  }
  const first = step.instruction.trim().split(/\n/)[0] ?? "";
  if (!first) return "Say what Tex does";
  return first.length > 70 ? `${first.slice(0, 69)}…` : first;
}

const quote = (word: string) => `“${word}”`;

/**
 * The label on the arrow into a step with a condition: "only if: mentions “urgent”". Null for none
 * (and for step 1, which always runs).
 */
export function conditionLabel(onlyIf: Pick<AutomationStepCondition, "kind" | "words" | "question"> | null | undefined, index: number): string | null {
  if (!onlyIf || index === 0) return null;
  switch (onlyIf.kind) {
    case "found":
      return "only if: the step before found something";
    case "mentions": {
      const words = onlyIf.words ?? [];
      if (words.length === 0) return "only if: mentions (no words yet)";
      const shown = words.slice(0, 3).map(quote);
      return `only if: mentions ${listNames(shown, "or")}${words.length > 3 ? ` +${words.length - 3}` : ""}`;
    }
    case "tex": {
      const question = onlyIf.question?.trim();
      return `only if Tex says yes: ${question ? quote(question.length > 60 ? `${question.slice(0, 59)}…` : question) : "(no question yet)"}`;
    }
    default:
      return null;
  }
}

/** The grey exit beside a condition: a false one stops the run there. */
export const EXIT_LABEL = "otherwise: stop";

/** The same condition in a sentence, for a panel: what it checks and what a false one does. */
export function conditionSentence(onlyIf: Pick<AutomationStepCondition, "kind" | "words" | "question">, index: number): string {
  if (index === 0 || onlyIf.kind === "always") return "Always runs.";
  const stop = "If not, the run stops here and the steps after it are skipped.";
  if (onlyIf.kind === "found") return `Only if step ${index} found something (not an empty list, not “nothing”). ${stop}`;
  if (onlyIf.kind === "mentions") return `Only if step ${index}’s result mentions any of ${listNames((onlyIf.words ?? []).map(quote), "or") || "the words"}, ignoring capitals. ${stop}`;
  return `Only if Tex answers yes to ${quote(onlyIf.question ?? "")}, on step ${index}’s result. That is Tex’s judgement, so less certain than the others. ${stop}`;
}

/** A preview of the steps as saved ones, for the flow drawn while they are edited. */
export function previewSteps(steps: readonly EditorStep[], actionLabel?: (step: EditorStep) => string | null | undefined): AutomationStep[] {
  return toStepInputs(steps).map((input, index) => {
    const step = steps[index];
    return {
      id: step.id,
      type: step.type,
      title: stepTitle(step, actionLabel?.(step)),
      app: step.type === "action" ? step.app || null : null,
      action: step.type === "action" ? step.action || null : null,
      inputs: step.type === "action" ? (input.inputs ?? {}) : {},
      instruction: step.type === "tex" ? step.instruction : null,
      readApps: step.type === "tex" ? [...step.readApps] : [],
      askFirst: step.type === "action" && (step.risky || step.askFirst),
      onlyIf: input.onlyIf ?? { kind: "always" },
      showResult: step.showResult,
      risky: step.type === "action" && step.risky,
    };
  });
}

// ---------------------------------------------------------------- problems

/** The server's problems of the steps: each step's (by its id), and the list's own (more than 6). */
export type StepsProblems = { byStepId: Map<string, string[]>; list: string[] };

export function problemsOfSteps(problems: readonly { step?: string | null; stepId?: string | null; message: string }[] | null | undefined): StepsProblems {
  const byStepId = new Map<string, string[]>();
  const list: string[] = [];
  for (const problem of problems ?? []) {
    if (problem.step !== "steps") continue;
    if (problem.stepId) byStepId.set(problem.stepId, [...(byStepId.get(problem.stepId) ?? []), problem.message]);
    else list.push(problem.message);
  }
  return { byStepId, list };
}

// ---------------------------------------------------------------- what the app actions cost

type CostStep = Pick<AutomationStep, "type" | "app" | "action" | "risky">;

/**
 * The most the app actions can cost, said once near the steps: an action that changes something is
 * 1 credit each time it is done ("At most 1 credit per “Send email” done, plus AI and awake time").
 * `lookup` gives the action as the app describes it, when its list is in; until then a risky one
 * counts as changing (it does), and the others are left out of the sum, with a word that the rest
 * is still being looked up.
 */
export function stepsCostLine(steps: readonly CostStep[], lookup: (app: string, action: string) => AppAction | undefined): string {
  const actions = steps.filter((step) => step.type === "action" && step.app && step.action);
  if (actions.length === 0) return "Tex steps only read and write words: a run costs its AI and awake time, as any run.";
  const changing: string[] = [];
  let unknown = false;
  for (const step of actions) {
    const found = lookup(step.app!, step.action!);
    const changes = found ? found.changesSomething : step.risky ? true : null;
    if (changes === null) unknown = true;
    else if (changes) changing.push(quote(found?.name ?? actionName(step.action!, step.app)));
  }
  const names = [...new Set(changing)];
  if (names.length === 0)
    return unknown
      ? "Working out what the app actions cost…"
      : "These app actions only read, so they cost no credits: a run costs its AI and awake time, as any run.";
  const per = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", per ")} and per ${names[names.length - 1]}`;
  return `At most 1 credit per ${per} done, plus AI and awake time.${unknown ? " Still looking up the other actions." : ""}`;
}

// ---------------------------------------------------------------- the last run's trail

export type TrailTone = "done" | "waiting" | "danger" | "muted" | "running";
/** What a box says of its step in the last run. */
export type TrailMark = { label: string; tone: TrailTone };

/** One step of the last run, in a word or a short line: "Done", "Skipped", "Failed: …", "Waiting for your OK". */
export function trailMark(step: Pick<AutomationRunStep, "state" | "reason">, runOver: boolean): TrailMark | null {
  switch (step.state) {
    case "done":
      return { label: "Done", tone: "done" };
    case "skipped":
      return { label: step.reason ? `Skipped: ${step.reason}` : "Skipped", tone: "muted" };
    case "failed":
      return { label: step.reason ? `Failed: ${step.reason}` : "Failed", tone: "danger" };
    case "waiting":
      return { label: "Waiting for your OK", tone: "waiting" };
    case "running":
      return { label: "Running now", tone: "running" };
    default:
      return runOver ? { label: "Not reached", tone: "muted" } : null;
  }
}

/** Each step's mark in a run, by step id. */
export function runTrail(run: Pick<AutomationRun, "state" | "steps"> | null | undefined): Map<string, TrailMark> {
  const marks = new Map<string, TrailMark>();
  if (!run) return marks;
  const over = run.state !== "running" && run.state !== "waiting";
  for (const step of run.steps) {
    const mark = trailMark(step, over);
    if (mark) marks.set(step.stepId, mark);
  }
  return marks;
}

/** The last run in a line, over the canvas: "Last run, 2h ago: stopped at step 2: no urgent email." */
export function runSummary(run: AutomationRun, now = new Date()): { line: string; tone: TrailTone } {
  const name = run.test ? "Last test run" : "Last run";
  const ago = formatAgo(run.startedAt, now);
  const when = ago === "Yesterday" ? "yesterday" : ago;
  const at = run.steps.find((step) => step.stepId === run.currentStepId) ?? run.steps.find((step) => step.state === "failed" || step.state === "waiting");
  const stepWord = at ? `step ${at.number}` : "a step";
  let text: string;
  let tone: TrailTone;
  switch (run.state) {
    case "running":
      text = `running now, on ${stepWord}`;
      tone = "running";
      break;
    case "waiting":
      text = `waiting for your OK on ${stepWord}. Answer it in the chat or under Approvals`;
      tone = "waiting";
      break;
    case "done":
      text = "done, every step ran";
      tone = "done";
      break;
    case "stopped":
      text = `stopped${at ? ` at ${stepWord}` : ""}${run.stopReason ? `: ${run.stopReason}` : ""}`;
      tone = "muted";
      break;
    case "failed":
      text = `failed${at ? ` at ${stepWord}` : ""}${run.stopReason ? `: ${run.stopReason}` : ""}`;
      tone = "danger";
      break;
    default:
      text = "replaced by a newer run before your OK came";
      tone = "muted";
  }
  return { line: `${name}, ${when}: ${text}${/[.!?]$/.test(text) ? "" : "."}`, tone };
}

/** The runs list with one run put in (a newer copy replaces the older), newest first, at most 10. */
export function withRun(runs: readonly AutomationRun[] | undefined, run: AutomationRun): AutomationRun[] {
  const others = (runs ?? []).filter((item) => item.id !== run.id);
  return [run, ...others].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 10);
}

// ---------------------------------------------------------------- the page's shape at a width

/** How steps are shown: a form on a phone, the canvas top to bottom below 1,280 px, left to right above. */
export type StepsShape = "form" | "down" | "across";

/** Below this the page is a form (and the canvas libraries are never fetched). */
export const CANVAS_FROM_PX = 768;
/** From this the canvas runs left to right. */
export const ACROSS_FROM_PX = 1280;
/** The same, as a media query. */
export const ACROSS_QUERY = `(min-width: ${ACROSS_FROM_PX}px)`;

export function stepsShape(width: number): StepsShape {
  if (width < CANVAS_FROM_PX) return "form";
  return width < ACROSS_FROM_PX ? "down" : "across";
}
