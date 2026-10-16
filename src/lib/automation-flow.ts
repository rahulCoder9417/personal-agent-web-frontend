// An automation as a flow: the same five steps, left to right, everywhere it is drawn (the strip on
// a card, the canvas on its own page, the list on a phone, the draft's card in the chat):
//
//   Trigger → Tex's instruction → Apps Tex may use → Asks you first → Results
//
// Every automation has this shape today: one trigger, one instruction, and fixed rules for approvals
// and results (`../beckend/docs/automations-flow-proposal.md`, section 3). Nothing here draws; the
// views only lay these steps out.

import type { Automation, AutomationDraft, AutomationTrigger } from "./api/client";
import { describeAutomationStatus, describeAutomationTimes, describeAutomationWhen, type AutomationStatus } from "./automations";
import { AUTOMATION_KIND_LABEL, CHANNEL_LABEL, formatDateTime, humanizeEvent, listNames, PR_REVIEW_LABEL, titleCase } from "./format";

export type FlowStepId = "trigger" | "instruction" | "apps" | "asks" | "results";

/** The five steps, in the order they are drawn. */
export const FLOW_STEP_IDS: readonly FlowStepId[] = ["trigger", "instruction", "apps", "asks", "results"];

/** One line of a step's details: a label and what it says. */
export type FlowDetail = { label: string; value: string };

export type FlowStep = {
  id: FlowStepId;
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
};

/**
 * What a flow is drawn from: an automation, or a draft Tex proposed (the same parts). `enabled` and
 * `pausedReason` belong to a saved one; a draft has neither, and reads as "Not saved yet".
 */
export type FlowSource = Pick<Automation, "kind" | "title" | "instruction" | "runAt" | "cron" | "timezone" | "preset" | "copyTo" | "nextRunAt" | "lastRunAt" | "askFirst"> & {
  trigger?: AutomationTrigger | null;
  /** The apps Tex said it will use (phase 2). The trigger's app is not repeated there. */
  apps?: readonly string[] | null;
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

/**
 * The five steps of an automation or a draft, in order. `accountZone` is the person's own time
 * zone, so a schedule in it reads "your time".
 */
export function automationFlow(source: FlowSource, accountZone?: string | null, now = new Date()): FlowStep[] {
  return [triggerStep(source, accountZone, now), instructionStep(source), appsStep(source), asksStep(source), resultsStep(source)];
}

/** One step by its id. */
export function flowStep(steps: readonly FlowStep[], id: FlowStepId): FlowStep {
  return steps.find((step) => step.id === id) ?? steps[0];
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

/** The steps a draft would change in the automation it changes. */
export function changedSteps(draft: FlowSource, current: FlowSource): Set<FlowStepId> {
  const next = stepParts(draft);
  const now = stepParts(current);
  return new Set(FLOW_STEP_IDS.filter((id) => next[id] !== now[id]));
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
