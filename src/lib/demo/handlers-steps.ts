// Automations with steps (phase 4), for the demo account, with the backend's rules
// (`../beckend/openapi/openapi.yaml`: listAppActions, listAutomationRuns, and `steps` on check,
// create and change): a few actions per app, each step checked with its problem on its own box, and
// a test run that goes through the steps, with its trail on the canvas.

import type { AppAction, AppEventSetting, Automation, AutomationProblem, AutomationRun, AutomationStep, AutomationStepInput } from "@/lib/api/client";
import { actionName, MAX_STEPS } from "@/lib/automation-steps";
import { nowIso, type Handler } from "./context";
import { badRequest, isRecord, json, notFound } from "./http";
import { emit, nextId, type DemoState } from "./store";

const input = (name: string, title: string, description: string, type: AppEventSetting["type"] = "string", required = false): AppEventSetting => ({
  name,
  title,
  description,
  type,
  required,
});

const action = (slug: string, name: string, description: string, inputs: AppEventSetting[], kind: "read" | "change" | "risky"): AppAction => ({
  slug,
  name,
  description,
  requiresApproval: kind === "risky",
  changesSomething: kind !== "read",
  inputs,
});

/** A few actions per app, as Composio describes them (the real lists are much longer). */
export const DEMO_APP_ACTIONS: Record<string, AppAction[]> = {
  gmail: [
    action("GMAIL_FETCH_EMAILS", "Fetch emails", "Emails matching a Gmail search, newest first.", [input("query", "Search", "A Gmail search, such as from:boss@acme.com is:unread."), input("max_results", "How many", "At most this many emails.", "integer")], "read"),
    action("GMAIL_SEND_EMAIL", "Send email", "Sends an email from your Gmail.", [input("recipient_email", "To", "Who it goes to.", "string", true), input("subject", "Subject", "The subject line."), input("body", "Body", "What it says.", "string", true)], "risky"),
    action("GMAIL_CREATE_EMAIL_DRAFT", "Create a draft", "Saves an email as a draft, not sent.", [input("recipient_email", "To", "Who it would go to.", "string", true), input("subject", "Subject", "The subject line."), input("body", "Body", "What it says.", "string", true)], "change"),
    action("GMAIL_ADD_LABEL_TO_EMAIL", "Add a label", "Puts a label on an email.", [input("message_id", "Email", "The email's id.", "string", true), input("label_ids", "Labels", "The labels to add.", "array", true)], "change"),
  ],
  github: [
    action("GITHUB_LIST_PULL_REQUESTS", "List pull requests", "The pull requests of a repository.", [input("owner", "Owner", "Who owns the repository.", "string", true), input("repo", "Repository", "Its name.", "string", true), input("state", "State", "open, closed or all.")], "read"),
    action("GITHUB_CREATE_AN_ISSUE", "Create an issue", "Opens an issue in a repository.", [input("owner", "Owner", "Who owns the repository.", "string", true), input("repo", "Repository", "Its name.", "string", true), input("title", "Title", "The issue's title.", "string", true), input("body", "Body", "What it says.")], "change"),
  ],
  slack: [
    action("SLACK_FETCH_CONVERSATION_HISTORY", "Read a channel", "The latest messages in a channel.", [input("channel", "Channel", "Such as #general.", "string", true)], "read"),
    action("SLACK_SEND_MESSAGE", "Send a message", "Posts a message in a channel.", [input("channel", "Channel", "Such as #general.", "string", true), input("text", "Text", "What it says.", "string", true)], "risky"),
  ],
  googlecalendar: [
    action("GOOGLECALENDAR_EVENTS_LIST", "List events", "The events of a calendar in a time range.", [input("calendarId", "Calendar", "primary is your main one.")], "read"),
    action("GOOGLECALENDAR_CREATE_EVENT", "Create an event", "Adds an event to a calendar.", [input("summary", "Title", "The event's title.", "string", true), input("start_datetime", "Starts", "When it starts.", "string", true)], "change"),
  ],
};

export const listAppActions: Handler = ({ state, params, url }) => {
  if (!state.apps.some((app) => app.slug === params.appSlug)) throw notFound("App not found");
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const items = (DEMO_APP_ACTIONS[params.appSlug] ?? []).filter(
    (item) => !search || item.slug.toLowerCase().includes(search) || item.name.toLowerCase().includes(search) || item.description.toLowerCase().includes(search),
  );
  return json({ items });
};

const findAction = (app: string | null | undefined, slug: string | null | undefined) => (app && slug ? DEMO_APP_ACTIONS[app]?.find((item) => item.slug === slug) : undefined);

/** The steps of a body, as the contract allows them (only `type` is needed; the rest is checked). */
export function stepsFrom(body: Record<string, unknown>): AutomationStepInput[] {
  if (body.steps === undefined || body.steps === null) return [];
  if (!Array.isArray(body.steps) || body.steps.some((step) => !isRecord(step) || (step.type !== "action" && step.type !== "tex"))) throw badRequest("steps must be a list of steps, each of type action or tex");
  return body.steps as AutomationStepInput[];
}

/** Every problem with the steps, each on its step, as the backend's check finds them. */
export function stepProblems(state: DemoState, steps: readonly AutomationStepInput[]): AutomationProblem[] {
  const problems: AutomationProblem[] = [];
  if (steps.length > MAX_STEPS) problems.push({ step: "steps", stepId: null, code: "invalid", message: `An automation has up to ${MAX_STEPS} steps.` });
  const usable = (slug: string) => {
    const app = state.apps.find((item) => item.slug === slug);
    if (!app) return `“${slug}” is not an app we know.`;
    if (!app.availableOnPlan) return `${app.name} isn’t on your plan.`;
    if (!app.connections.some((connection) => connection.status === "active")) return `${app.name} is not connected. Connect it under Integrations, Apps.`;
    return null;
  };
  steps.forEach((step, index) => {
    const n = index + 1;
    const say = (message: string) => problems.push({ step: "steps", stepId: step.id ?? null, code: "invalid", message: `Step ${n}: ${message}` });
    const kind = step.onlyIf?.kind ?? "always";
    if (n === 1 && kind !== "always") say("the first step always runs, so it has no “only if”.");
    if (kind === "mentions" && !(step.onlyIf?.words ?? []).some((word) => word.trim())) say("give at least one word for “mentions”.");
    if (kind === "tex" && !step.onlyIf?.question?.trim()) say("write the question Tex decides.");
    if (step.type === "action") {
      if (!step.app) return say("pick the app.");
      const problem = usable(step.app);
      if (problem) return say(problem);
      if (!step.action) return say("pick the action.");
      const found = findAction(step.app, step.action);
      if (!found) return say(`${step.action} is not one of ${step.app}’s actions. Pick one from the list.`);
      const names = new Set(found.inputs.map((item) => item.name));
      for (const name of Object.keys(step.inputs ?? {}))
        if (!names.has(name)) return say(`${found.name} has no input \`${name}\`. Its inputs: ${[...names].join(", ")}.`);
    } else {
      if (!step.instruction?.trim()) say("write what Tex does in this step.");
      for (const slug of step.readApps ?? []) {
        const problem = usable(slug);
        if (problem) say(problem);
      }
    }
  });
  return problems;
}

/** The steps as saved: every part filled, a risky action's "ask me first" on. */
export function savedSteps(steps: readonly AutomationStepInput[], seq: () => string): AutomationStep[] {
  return steps.map((step, index) => {
    const found = findAction(step.app, step.action);
    const risky = step.type === "action" && Boolean(found?.requiresApproval);
    const title = step.title?.trim() || (step.type === "action" ? (found ? `${step.app === "gmail" ? "Gmail" : step.app}: ${found.name.toLowerCase()}` : actionName(step.action ?? "", step.app)) : (step.instruction ?? "").trim().slice(0, 80));
    return {
      id: step.id ?? seq(),
      type: step.type,
      title,
      app: step.type === "action" ? (step.app ?? null) : null,
      action: step.type === "action" ? (step.action ?? null) : null,
      inputs: step.type === "action" ? { ...(step.inputs ?? {}) } : {},
      instruction: step.type === "tex" ? (step.instruction ?? null) : null,
      readApps: step.type === "tex" ? [...(step.readApps ?? [])] : [],
      askFirst: step.type === "action" && (risky || step.askFirst === true),
      onlyIf: index === 0 ? { kind: "always" } : (step.onlyIf ?? { kind: "always" }),
      showResult: step.showResult === true,
      risky,
    };
  });
}

/** The apps the steps name, each once. */
export function appsOfSteps(steps: readonly AutomationStep[]): string[] {
  return [...new Set(steps.flatMap((step) => (step.type === "action" ? (step.app ? [step.app] : []) : step.readApps)))];
}

// ---------------------------------------------------------------- runs

const runs = new WeakMap<DemoState, Map<string, AutomationRun[]>>();
const runsOf = (state: DemoState, automationId: string): AutomationRun[] => {
  let byAutomation = runs.get(state);
  if (!byAutomation) runs.set(state, (byAutomation = new Map()));
  return byAutomation.get(automationId) ?? [];
};

export const listAutomationRuns: Handler = ({ state, params }) => {
  if (!state.automations.some((automation) => automation.id === params.automationId)) throw notFound("Automation not found");
  return json({ items: runsOf(state, params.automationId).slice(0, 10) });
};

/**
 * A test run of an automation with steps in the demo: each step is done in turn, until one that asks
 * first (it then waits for the OK) or the end. Its trail is sent on the stream as it goes.
 */
export function demoStepRun(state: DemoState, automation: Automation): AutomationRun {
  const steps = automation.steps ?? [];
  const waitingAt = steps.findIndex((step) => step.askFirst);
  const end = waitingAt >= 0 ? waitingAt : steps.length;
  const run: AutomationRun = {
    id: nextId(state, "arn"),
    automationId: automation.id,
    state: waitingAt >= 0 ? "waiting" : "done",
    test: true,
    currentStepId: waitingAt >= 0 ? steps[waitingAt].id : null,
    stopReason: null,
    steps: steps.map((step, index) => ({
      stepId: step.id,
      number: index + 1,
      title: step.title,
      state: index < end ? "done" : index === waitingAt ? "waiting" : "pending",
      result: index < end ? (step.type === "action" ? "1 email from boss@acme.com: “URGENT: board deck”." : "One is urgent: the board deck is due today.") : null,
      reason: null,
      tries: index < end && step.type === "action" ? 1 : 0,
      approvalId: null,
    })),
    resultsRemoved: false,
    startedAt: nowIso(),
    endedAt: waitingAt >= 0 ? null : nowIso(),
  };
  const list = runsOf(state, automation.id);
  runs.get(state)!.set(automation.id, [run, ...list].slice(0, 10));
  emit(state, "automation_run.updated", run);
  return run;
}

/** The trail line the backend adds under a run's answer: "Steps: 1 ✓ 2 ✓ 3 waiting for your OK". */
export function trailText(run: AutomationRun): string {
  const mark = (state: AutomationRun["steps"][number]["state"]) =>
    state === "done" ? "✓" : state === "failed" ? "✗ failed" : state === "waiting" ? "waiting for your OK" : state === "running" ? "…" : "skipped";
  return `Steps: ${run.steps.map((step) => `${step.number} ${mark(step.state)}`).join(" ")}`;
}
