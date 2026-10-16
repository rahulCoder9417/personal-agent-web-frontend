// An automation as a flow, the same everywhere it is drawn (the strip on a card, the canvas on its
// own page, the list on a phone, the draft's card in the chat). A one-instruction automation is five
// boxes:
//
//   Trigger → Tex's instruction → Apps Tex may use → Asks you first → Results
//
// (`../beckend/docs/automations-flow-proposal.md`, section 3). One with steps (phase 4) is the
// trigger, each step in order, and the results:
//
//   Trigger → Step 1 → … → Step N → Results
//
// with a step's "only if" on the arrow into it. Nothing here draws; the views only lay these out.

import type { Automation, AutomationDraft, AutomationStep, AutomationTrigger } from "./api/client";
import { actionName, conditionLabel, conditionSentence, stepApps } from "./automation-steps";
import { describeAutomationStatus, describeAutomationTimes, describeAutomationWhen, type AutomationStatus } from "./automations";
import { AUTOMATION_KIND_LABEL, CHANNEL_LABEL, formatDateTime, humanizeEvent, listNames, PR_REVIEW_LABEL, titleCase } from "./format";

export type FlowStepId = "trigger" | "instruction" | "apps" | "asks" | "results";

/** The five steps, in the order they are drawn. */
export const FLOW_STEP_IDS: readonly FlowStepId[] = ["trigger", "instruction", "apps", "asks", "results"];

/** One line of a step's details: a label and what it says. */
export type FlowDetail = { label: string; value: string };

/** A box that is one step of an automation with steps. */
export type FlowStepInfo = {
  /** The step's own id (`AutomationStep.id`). */
  id: string;
  /** 1 for the first. */
  number: number;
  type: AutomationStep["type"];
  app: string | null;
  /** The label on the arrow into it ("only if: mentions “urgent”"), or null when it always runs. */
  condition: string | null;
  /** It waits for the person's yes before it runs. */
  askFirst: boolean;
  /** …and that can't be turned off: its action sends, deletes or pays. */
  locked: boolean;
  /** "Show me this": its result goes into the run's answer. */
  showResult: boolean;
};

export type FlowStep = {
  /**
   * Which of the five boxes it is. A step of an automation with steps is drawn as Tex's box (a Tex
   * step) or as the apps' box (an app action), so it has the same marks.
   */
  id: FlowStepId;
  /** Unique in the flow: the box's id for the five, `step:<its id>` for a step. Selection and problems use it. */
  key: string;
  /** The step's name, small, above its title: "Trigger", "Tex's instruction"… */
  label: string;
  /** What the step says, in one short line: the node's title. */
  title: string;
  /** A word or two for the strip on a card, where the five sit side by side: "Schedule", "Tex", "GitHub". */
  short: string;
  /** A few short lines under the title (settings, a copy to Telegram). */
  lines: string[];
  /** The apps it names, by slug, for their marks. */
  apps: string[];
  /** Everything about the step, for its side panel and the list on a phone. */
  details: FlowDetail[];
  /** A sentence under the details that explains the step. */
  note?: string;
  /** How the step stands: `paused` and `danger` (paused by the system) dim or mark the trigger. */
  tone: "default" | "paused" | "danger";
  /** Set on a step of an automation with steps. */
  step?: FlowStepInfo;
};

/** The key of a step's box in a flow. */
export const stepKey = (stepId: string) => `step:${stepId}`;

/** Whether an automation or a draft runs as steps (an older backend sends none: one instruction). */
export function hasSteps(source: { steps?: readonly unknown[] | null }): boolean {
  return (source.steps?.length ?? 0) > 0;
}

/**
 * What a flow is drawn from: an automation, or a draft Tex proposed (the same parts). `enabled` and
 * `pausedReason` belong to a saved one; a draft has neither, and reads as "Not saved yet".
 */
export type FlowSource = Pick<Automation, "kind" | "title" | "instruction" | "runAt" | "cron" | "timezone" | "preset" | "copyTo" | "nextRunAt" | "lastRunAt" | "askFirst"> & {
  trigger?: AutomationTrigger | null;
  /** The apps Tex said it will use (phase 2). The trigger's app is not repeated there. */
  apps?: readonly string[] | null;
  /** Its steps (phase 4); none is one instruction. */
  steps?: readonly AutomationStep[] | null;
  enabled?: boolean;
  pausedReason?: Automation["pausedReason"];
  /** A draft that is no longer open: what became of it (`draftState`), in place of "Not saved yet". */
  settled?: { label: string; line: string };
};

const STEP_LABEL: Record<FlowStepId, string> = {
  trigger: "Trigger",
  instruction: "Tex’s instruction",
  apps: "Apps Tex may use",
  asks: "Asks you first",
  results: "Results",
};

/** The fixed rule for risky actions, the same for every automation but pull-request review. */
export const ASKS_FIRST = "Sending, deleting or paying waits for your OK";
/** The stricter choice (`askFirst: changes`). */
export const ASKS_CHANGES = "Anything that changes something waits for your OK";
export const REVIEW_ASKS = "Comments without asking; never merges or approves";
export const NO_APPS = "Your connected apps, as needed";
export const INSTRUCTION_NOTE = "Tex follows this in its own way: it reads the instruction each time and decides what to do, as it would with a message from you.";

/** "owner" → "Owner", "label_ids" → "Label ids". */
function settingName(key: string): string {
  const words = humanizeEvent(key.replace(/([a-z])([A-Z])/g, "$1 $2"));
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function settingValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  if (Array.isArray(value)) return value.map(settingValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/**
 * A trigger's settings as label and value, as the app was told to watch: "Repository: acme/web" for
 * an owner and a repo, else each setting under its own name. At most six.
 */
export function triggerSettings(config: Record<string, unknown> | null | undefined): FlowDetail[] {
  if (!config) return [];
  const entries = Object.entries(config).filter(([, value]) => value !== undefined);
  const owner = config.owner;
  const repo = config.repo;
  const out: FlowDetail[] = [];
  if (typeof owner === "string" && typeof repo === "string") out.push({ label: "Repository", value: `${owner}/${repo}` });
  for (const [key, value] of entries) {
    if (out.length && (key === "owner" || key === "repo")) continue;
    out.push({ label: settingName(key), value: settingValue(value) });
  }
  return out.slice(0, 6);
}

/** The repo a pull-request review watches, from its settings ("acme/web"), when they say. */
export function reviewedRepo(source: Pick<FlowSource, "trigger">): string | null {
  const config = source.trigger?.config;
  return typeof config?.owner === "string" && typeof config?.repo === "string" ? `${config.owner}/${config.repo}` : null;
}

/** The apps a flow names: the trigger's app first, then the ones Tex named, each once. */
export function flowApps(source: Pick<FlowSource, "trigger" | "apps" | "preset">): string[] {
  const apps = [source.preset === "pr_review" ? "github" : source.trigger?.app, ...(source.apps ?? [])]
    .filter((app): app is string => Boolean(app))
    .map((app) => app.toLowerCase());
  return [...new Set(apps)];
}

/** How a source stands: on, paused (and why), or, for a draft, not saved yet. */
export function flowStatus(source: FlowSource): AutomationStatus {
  if (source.enabled === undefined) return { label: source.settled?.label ?? "Not saved yet", tone: "muted" };
  return describeAutomationStatus({ enabled: source.enabled, pausedReason: source.pausedReason });
}

function triggerStep(source: FlowSource, accountZone: string | null | undefined, now: Date): FlowStep {
  const review = source.preset === "pr_review";
  const status = flowStatus(source);
  const saved = source.enabled !== undefined;
  const repo = reviewedRepo(source);
  const when = describeAutomationWhen(source, accountZone, now);
  const title = review ? `A pull request opens or gets new commits${repo ? ` in ${repo}` : ""}` : when;
  const settings = review ? [] : triggerSettings(source.trigger?.config);

  const details: FlowDetail[] = [
    { label: "When", value: title },
    { label: "Kind", value: review ? PR_REVIEW_LABEL : AUTOMATION_KIND_LABEL[source.kind] },
  ];
  if (source.kind === "event" && source.trigger?.app) {
    details.push({ label: "App", value: titleCase(source.trigger.app) });
    if (!review && source.trigger.event) details.push({ label: "Event", value: source.trigger.event });
  }
  if (review && repo) details.push({ label: "Repository", value: repo });
  details.push(...settings);
  if (source.kind !== "event" && source.timezone) details.push({ label: "Time zone", value: source.timezone });
  if (saved) {
    const times = describeAutomationTimes({ ...source, enabled: source.enabled ?? true }, now);
    details.push({ label: "Status", value: status.label }, { label: "Next run", value: times.next }, { label: "Last run", value: times.last });
  } else if (source.settled) {
    details.push({ label: "Status", value: source.settled.line });
  } else {
    details.push({ label: "Status", value: "Not saved yet: nothing runs until you save it" });
    if (source.kind !== "event" && source.nextRunAt) details.push({ label: "First run", value: `${formatDateTime(source.nextRunAt, now)}, once saved` });
  }

  const app = source.trigger?.app ? titleCase(source.trigger.app) : "App";
  const short = review ? "New pull request" : source.kind === "once" ? "Once" : source.kind === "repeat" ? "Schedule" : `${app} event`;
  return {
    id: "trigger",
    key: "trigger",
    label: STEP_LABEL.trigger,
    title,
    short,
    lines: [...settings.map((setting) => `${setting.label}: ${setting.value}`).slice(0, 2), status.label],
    apps: source.kind === "event" ? flowApps({ trigger: source.trigger, preset: source.preset }) : [],
    details,
    tone: !saved || source.enabled ? "default" : status.tone === "danger" ? "danger" : "paused",
  };
}

function instructionStep(source: FlowSource): FlowStep {
  if (source.preset === "pr_review") {
    return {
      id: "instruction",
      key: "instruction",
      label: STEP_LABEL.instruction,
      title: "Patch reviews it",
      short: "Patch reviews",
      lines: ["Comments on the pull request and sends you a short verdict"],
      apps: [],
      details: [
        { label: "Who", value: "Patch, the crew’s reviewer" },
        { label: "What", value: "Reads the changes, looks for bugs, security problems and missing tests, and posts one review." },
      ],
      note: "Each new commit is reviewed once. Patch never merges and never approves.",
      tone: "default",
    };
  }
  return {
    id: "instruction",
    key: "instruction",
    label: STEP_LABEL.instruction,
    title: source.title,
    short: "Tex",
    lines: [source.instruction],
    apps: [],
    details: [
      { label: "Title", value: source.title },
      { label: "Instruction", value: source.instruction },
    ],
    note: INSTRUCTION_NOTE,
    tone: "default",
  };
}

function appsStep(source: FlowSource): FlowStep {
  const apps = flowApps(source);
  const names = apps.map(titleCase);
  return {
    id: "apps",
    key: "apps",
    label: STEP_LABEL.apps,
    title: names.length ? listNames(names, "and") : NO_APPS,
    short: names.length === 0 ? "Your apps" : names.length <= 2 ? names.join(", ") : `${names.length} apps`,
    lines: names.length ? [] : ["Tex picks from what you’ve connected"],
    apps,
    details: [{ label: "Apps", value: names.length ? listNames(names, "and") : NO_APPS }],
    note: names.length
      ? "During a run Tex may use only these apps, and the trigger’s app: an action in any other app is refused. Each must stay connected under Integrations → Apps."
      : "No apps are named, so Tex uses whichever of your connected apps the instruction needs. Name some to keep its runs to those.",
    tone: "default",
  };
}

function asksStep(source: FlowSource): FlowStep {
  const review = source.preset === "pr_review";
  const strict = !review && source.askFirst === "changes";
  return {
    id: "asks",
    key: "asks",
    label: STEP_LABEL.asks,
    title: review ? REVIEW_ASKS : strict ? ASKS_CHANGES : ASKS_FIRST,
    short: review ? "Comments only" : strict ? "Asks always" : "Asks first",
    lines: [],
    apps: [],
    details: [
      {
        label: "The rule",
        value: review
          ? "Turning review on is your OK for one thing: a review or a comment on a pull request in this repo. Merging, approving, closing or anything in another repo still waits for your OK."
          : strict
            ? "Before any app action that changes something (sending, creating, updating, deleting, paying), Tex stops and asks you, in the chat. Reading and searching don’t ask."
            : "Before Tex sends something to another person, deletes something or pays, it stops and asks you, in the chat. Reading and searching don’t ask.",
      },
    ],
    note: strict
      ? "Stricter than the platform’s rule, which every run keeps: sending, deleting or paying always waits for your OK."
      : "This is the platform’s rule for every run. It can be made stricter, never switched off.",
    tone: "default",
  };
}

function resultsStep(source: FlowSource): FlowStep {
  const review = source.preset === "pr_review";
  const copy = source.copyTo ? `Copy to ${CHANNEL_LABEL[source.copyTo]}` : null;
  return {
    id: "results",
    key: "results",
    label: STEP_LABEL.results,
    title: "Automations chat",
    short: source.copyTo ? `Chat + ${CHANNEL_LABEL[source.copyTo]}` : "Automations chat",
    lines: copy ? [copy] : [],
    apps: source.copyTo ? [source.copyTo] : [],
    details: [
      { label: "Where", value: review ? "Each verdict lands in your Automations chat." : "Each run answers in your Automations chat, never in your other chats." },
      {
        label: "A copy",
        value: copy ? `Each answer is also sent to your ${CHANNEL_LABEL[source.copyTo!]} chat, where it was made.` : "None: the answers stay in the Automations chat.",
      },
    ],
    note: "To follow up on a run, write in the Automations chat: Tex has the runs in mind there.",
    tone: "default",
  };
}

// ---------------------------------------------------------------- automations with steps

/** How long a run's results and its trail are kept (decision 7 of the proposal). */
export const KEPT_LINE = "Each step’s result is kept 2 days after the run, then removed; the trail of steps (done, skipped, failed) is kept 30 days.";
export const TEX_STEP_NOTE = "A Tex step only reads and writes words: it can read the apps named here, but it can’t change anything. To send, create or delete something, add an app action step.";
export const LOCKED_LINE = "Sending, deleting or paying always asks you first. This can’t be turned off.";

/** A fixed input as a line: "query: from:boss@acme.com". */
function inputLine(name: string, value: unknown): string {
  return `${name}: ${settingValue(value)}`;
}

/** One step of an automation with steps, as its box. */
function stepEntry(step: AutomationStep, index: number): FlowStep {
  const number = index + 1;
  const action = step.type === "action";
  const app = action ? step.app : null;
  const appName = app ? titleCase(app) : "App";
  const condition = conditionLabel(step.onlyIf, index);
  const inputs = Object.entries(step.inputs ?? {});
  const askFirst = action && (step.askFirst || step.risky);
  const instruction = step.instruction?.trim() ?? "";

  const details: FlowDetail[] = [{ label: "Type", value: action ? "App action" : "Tex instruction" }];
  if (action) {
    details.push({ label: "App", value: app ? appName : "Not picked yet" });
    details.push({ label: "Action", value: step.action ? actionName(step.action, app) : "Not picked yet" });
    details.push({ label: "Fixed inputs", value: inputs.length ? inputs.map(([name, value]) => inputLine(name, value)).join("\n") : "None: Tex fills them from the steps before" });
    details.push({ label: "Ask me first", value: step.risky ? "Yes, always: it sends, deletes or pays" : askFirst ? "Yes" : "No" });
  } else {
    details.push({ label: "Instruction", value: instruction || "Not written yet" });
    details.push({ label: "May read", value: step.readApps.length ? listNames(step.readApps.map(titleCase), "and") : "No app: only what the steps before found" });
  }
  if (index > 0) details.push({ label: "Only if", value: conditionSentence(step.onlyIf, index) });
  details.push({ label: "Show me this", value: step.showResult ? "Yes: its result is in the run’s answer" : "No: its result only goes to the next step" });

  const lines = action ? inputs.slice(0, 1).map(([name, value]) => inputLine(name, value)) : instruction && instruction !== step.title ? [instruction] : [];
  return {
    id: action ? "apps" : "instruction",
    key: stepKey(step.id),
    label: `Step ${number} · ${action ? appName : "Tex"}`,
    title: step.title,
    short: action ? appName : "Tex",
    lines,
    apps: action ? (app ? [app] : []) : [...step.readApps],
    details,
    note: action
      ? `Tex runs this one ${appName} action, with the inputs fixed here and the rest filled in from the steps before.${step.risky ? ` ${LOCKED_LINE}` : ""}`
      : TEX_STEP_NOTE,
    tone: "default",
    step: { id: step.id, number, type: step.type, app, condition, askFirst, locked: action && step.risky, showResult: step.showResult },
  };
}

/** The results of an automation with steps: the same chat and copy, which steps are shown, and how long it is all kept. */
function steppedResults(source: FlowSource, steps: readonly AutomationStep[]): FlowStep {
  const base = resultsStep(source);
  const shown = steps.map((step, index) => (step.showResult ? index + 1 : null)).filter((n): n is number => n !== null);
  return {
    ...base,
    details: [
      ...base.details,
      {
        label: "Shown",
        value: shown.length
          ? `The results of step${shown.length === 1 ? "" : "s"} ${listNames(shown.map(String), "and")}, in the run’s answer, with a line of how each step went.`
          : "Tex’s short answer, with a line of how each step went. Turn on “Show me this” on a step to see its result too.",
      },
      { label: "Kept", value: KEPT_LINE },
    ],
  };
}

/**
 * The boxes of an automation or a draft, in order: the five of a one-instruction automation, or the
 * trigger, each step and the results of one with steps. `accountZone` is the person's own time
 * zone, so a schedule in it reads "your time".
 */
export function automationFlow(source: FlowSource, accountZone?: string | null, now = new Date()): FlowStep[] {
  if (source.steps?.length && source.preset !== "pr_review") {
    const steps = source.steps;
    return [triggerStep(source, accountZone, now), ...steps.map(stepEntry), steppedResults(source, steps)];
  }
  return [triggerStep(source, accountZone, now), instructionStep(source), appsStep(source), asksStep(source), resultsStep(source)];
}

/** The apps an automation with steps names (its actions' and what its Tex steps read), each once. */
export function steppedApps(source: Pick<FlowSource, "steps" | "trigger">): string[] {
  return [...new Set([source.trigger?.app, ...stepApps((source.steps ?? []).map((step) => ({ type: step.type, app: step.app ?? "", readApps: step.readApps })))].filter((app): app is string => Boolean(app)))];
}

/** One box by its key (the five's keys are their ids). The first when it isn't there. */
export function flowStep(steps: readonly FlowStep[], key: string): FlowStep {
  return steps.find((step) => step.key === key) ?? steps[0];
}

/** The address of an automation's own page, where its flow is drawn. */
export function automationHref(automationId: string): string {
  return `/automations/${encodeURIComponent(automationId)}`;
}

// ---------------------------------------------------------------- drafts

/** A draft as the flow needs it: the parts of an automation, and whether it changes one. */
export type DraftLike = Pick<AutomationDraft, "id" | "changeOf">;

/**
 * Where a draft opens on the canvas: `/automations/new?draft=…`, or for a change
 * `/automations/<the automation>?draft=…`, which marks the steps that change.
 */
export function draftHref(draft: DraftLike): string {
  const id = encodeURIComponent(draft.id);
  return draft.changeOf ? `${automationHref(draft.changeOf)}?draft=${id}` : `/automations/new?draft=${id}`;
}

/** The parts each step is drawn from, to tell what a change alters (state and run times aside). */
function stepParts(source: FlowSource): Record<FlowStepId, string> {
  const trigger = source.trigger ? { app: source.trigger.app ?? null, event: source.trigger.event ?? null, config: source.trigger.config ?? {} } : null;
  return {
    trigger: JSON.stringify([source.kind, source.runAt ?? null, source.cron ?? null, source.kind === "event" ? null : (source.timezone ?? null), trigger]),
    instruction: JSON.stringify([source.title, source.instruction]),
    apps: JSON.stringify(flowApps(source)),
    asks: JSON.stringify([source.preset ?? null, source.askFirst ?? "risky"]),
    results: JSON.stringify(source.copyTo ?? null),
  };
}

/** A step as it is compared: everything the person set (`risky` is the server's, and follows the action). */
function stepPart(step: AutomationStep): string {
  return JSON.stringify([step.type, step.title, step.app, step.action, step.inputs ?? {}, step.instruction, step.readApps, step.askFirst, step.onlyIf, step.showResult]);
}

/**
 * The boxes a draft would change in the automation it changes, by key. With steps: the trigger, the
 * results, and each step that is new or set differently (a step is known by its id, so a moved one
 * whose own settings are the same is not marked).
 */
export function changedSteps(draft: FlowSource, current: FlowSource): Set<string> {
  const next = stepParts(draft);
  const now = stepParts(current);
  if (!hasSteps(draft) && !hasSteps(current)) return new Set(FLOW_STEP_IDS.filter((id) => next[id] !== now[id]));
  const changed = new Set<string>((["trigger", "results"] as const).filter((id) => next[id] !== now[id]));
  if (next.instruction !== now.instruction) changed.add("instruction");
  const before = new Map((current.steps ?? []).map((step) => [step.id, stepPart(step)]));
  for (const step of draft.steps ?? []) if (before.get(step.id) !== stepPart(step)) changed.add(stepKey(step.id));
  return changed;
}

export type DraftState = {
  /** A word or two, for a pill: "Not saved yet", "Saved". */
  label: string;
  tone: "waiting" | "done" | "muted";
  /** What it means, in a sentence. */
  line: string;
};

/** How a draft stands, in words. An open draft past its expiry reads as expired, as the API counts it. */
export function draftState(draft: Pick<AutomationDraft, "status" | "expiresAt">, now = new Date()): DraftState {
  const status = draft.status === "open" && Date.parse(draft.expiresAt) <= now.getTime() ? "expired" : draft.status;
  switch (status) {
    case "open":
      return { label: "Not saved yet", tone: "waiting", line: "Nothing runs until you save it." };
    case "saved":
      return { label: "Saved", tone: "done", line: "Saved. It runs from now on." };
    case "replaced":
      return { label: "Replaced", tone: "muted", line: "Tex made a newer version of this draft." };
    case "discarded":
      return { label: "Discarded", tone: "muted", line: "You discarded this draft. Nothing was set up." };
    default:
      return { label: "Expired", tone: "muted", line: "This draft expired. Ask Tex again." };
  }
}

/** When a draft would first run if saved now: "First run: Mon 19 Oct, 9:00 AM", or "Runs each time it happens". */
export function draftFirstRun(draft: Pick<AutomationDraft, "kind" | "nextRunAt">, now = new Date()): string | null {
  if (draft.kind === "event") return "Runs each time it happens";
  return draft.nextRunAt ? `First run: ${formatDateTime(draft.nextRunAt, now)}` : null;
}

/** How long an open draft is kept: "Expires in 6 days", "Expires in 5 hours", "Expires in 20 minutes". */
export function draftExpiry(draft: Pick<AutomationDraft, "expiresAt">, now = new Date()): string {
  const minutes = Math.floor((Date.parse(draft.expiresAt) - now.getTime()) / 60_000);
  if (minutes <= 0) return "Expired";
  if (minutes < 60) return `Expires in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `Expires in ${Math.ceil(hours / 24)} days`;
}
