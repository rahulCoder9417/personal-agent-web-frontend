// Building and changing automations by hand, for the demo account, with the backend's rules
// (`../beckend/openapi/openapi.yaml`: createAutomation, checkAutomation, changeAutomation,
// runAutomationNow, listAppEvents, createAutomationDraft). The checks find every problem at once,
// each on its box; a save makes one automation per `clientRequestId`; a change keeps the id; a test
// run is marked as one in the Automations chat and is limited to 10 an hour.

import type { AppEvent, Automation, AutomationDraft, AutomationParts, AutomationProblem } from "@/lib/api/client";
import { isTimeZone, MIN_INTERVAL_MINUTES, nextCronRuns, shortestGapMinutes } from "@/lib/automation-editor";
import { titleCase } from "@/lib/format";
import { nowIso, type Handler } from "./context";
import { postFromTex } from "./handlers-chat";
import { automationsChat } from "./handlers-conversations";
import { badRequest, HttpError, isRecord, json, notFound, outOfCredits, rateLimited, readJson, type JsonObject } from "./http";
import { appsOfSteps, demoStepRun, savedSteps, stepProblems, stepsFrom, trailText } from "./handlers-steps";
import { DRAFT_DAYS } from "./seed";
import { balanceOf, chargeUsage, emit, logActivity, nextId, schedule, type DemoState } from "./store";

/** Test runs an hour, per account, as the backend allows. */
export const TEST_RUNS_PER_HOUR = 10;
const HOUR_MS = 3_600_000;
/** How long the demo's Tex takes to answer a test run. */
export const TEST_RUN_ANSWER_MS = 1500;

/** What the demo keeps beside the account: the keys of saves and test runs, and when tests ran. */
type EditorMemory = { saves: Map<string, string>; runs: Map<string, string>; testRunsAt: number[] };
const memory = new WeakMap<DemoState, EditorMemory>();
function memoryOf(state: DemoState): EditorMemory {
  let found = memory.get(state);
  if (!found) memory.set(state, (found = { saves: new Map(), runs: new Map(), testRunsAt: [] }));
  return found;
}

// ---------------------------------------------------------------- the events apps offer

const setting = (name: string, title: string, description: string, type: "string" | "integer" | "boolean" = "string", required = false, extra: Partial<AppEvent["settings"][number]> = {}) => ({
  name,
  title,
  description,
  type,
  required,
  ...extra,
});

/** A few events per app, as Composio describes them (the real list is longer). */
export const DEMO_APP_EVENTS: Record<string, AppEvent[]> = {
  gmail: [
    {
      slug: "GMAIL_NEW_GMAIL_MESSAGE",
      name: "New email",
      description: "A new email arrives in the inbox.",
      settings: [
        setting("labelIds", "Label", "Only emails with this Gmail label, such as INBOX or IMPORTANT.", "string", false, { default: "INBOX" }),
        setting("query", "Search", "Only emails matching this Gmail search, such as from:boss@acme.com.", "string"),
        setting("interval", "Check every (minutes)", "How often Gmail is checked for new email.", "integer", false, { default: 1 }),
      ],
    },
  ],
  github: [
    {
      slug: "GITHUB_PULL_REQUEST_EVENT",
      name: "Pull request opened or updated",
      description: "A pull request opens, or gets new commits, in a repository.",
      settings: [setting("owner", "Owner", "The account or organisation that owns the repository.", "string", true), setting("repo", "Repository", "The repository's name.", "string", true)],
    },
    {
      slug: "GITHUB_COMMIT_EVENT",
      name: "New commit",
      description: "New commits are pushed to a repository.",
      settings: [setting("owner", "Owner", "The account or organisation that owns the repository.", "string", true), setting("repo", "Repository", "The repository's name.", "string", true)],
    },
    {
      slug: "GITHUB_ISSUE_ADDED_EVENT",
      name: "New issue",
      description: "A new issue is opened in a repository.",
      settings: [setting("owner", "Owner", "The account or organisation that owns the repository.", "string", true), setting("repo", "Repository", "The repository's name.", "string", true)],
    },
  ],
  slack: [
    {
      slug: "SLACK_RECEIVE_MESSAGE",
      name: "New message",
      description: "A new message is posted in a channel the app can see.",
      settings: [setting("channel", "Channel", "Only messages in this channel, such as #general. Empty: every channel.", "string")],
    },
  ],
  googlecalendar: [
    {
      slug: "GOOGLECALENDAR_EVENT_CREATED_TRIGGER",
      name: "New event",
      description: "A new event is added to a calendar.",
      settings: [setting("calendarId", "Calendar", "The calendar to watch; primary is your main one.", "string", false, { default: "primary" })],
    },
    {
      slug: "GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER",
      name: "Event starting soon",
      description: "An event is about to start.",
      settings: [
        setting("calendarId", "Calendar", "The calendar to watch; primary is your main one.", "string", false, { default: "primary" }),
        setting("minutesBefore", "Minutes before", "How long before the start to run.", "integer", true, { default: 15 }),
      ],
    },
  ],
};

export const listAppEvents: Handler = ({ state, params }) => {
  if (!state.apps.some((app) => app.slug === params.appSlug)) throw notFound("App not found");
  return json({ items: DEMO_APP_EVENTS[params.appSlug] ?? [] });
};

// ---------------------------------------------------------------- the checks

const STEPS = ["trigger", "instruction", "apps", "asks", "steps", "results"] as const;

/** The parts from a body, with only the kinds of values the contract allows. */
function partsFrom(body: JsonObject): AutomationParts {
  const text = (name: string) => (typeof body[name] === "string" ? (body[name] as string) : null);
  const trigger = isRecord(body.trigger)
    ? { app: String(body.trigger.app ?? ""), event: String(body.trigger.event ?? ""), config: isRecord(body.trigger.config) ? body.trigger.config : {} }
    : null;
  const askFirst = body.askFirst === "changes" ? "changes" : "risky";
  if (body.askFirst !== undefined && body.askFirst !== "risky" && body.askFirst !== "changes") throw badRequest("askFirst must be risky or changes");
  const copyTo = body.copyTo === "telegram" || body.copyTo === "whatsapp" || body.copyTo === "imessage" ? body.copyTo : null;
  if (body.apps !== undefined && (!Array.isArray(body.apps) || body.apps.some((app) => typeof app !== "string"))) throw badRequest("apps must be a list of app slugs");
  return {
    title: text("title") ?? "",
    instruction: text("instruction") ?? "",
    runAt: text("runAt"),
    cron: text("cron"),
    timezone: text("timezone"),
    trigger,
    apps: (body.apps as string[] | undefined) ?? [],
    askFirst,
    copyTo,
    steps: stepsFrom(body),
  };
}

const kindOfParts = (parts: AutomationParts): Automation["kind"] | null => {
  const given = [parts.runAt, parts.cron, parts.trigger].filter(Boolean).length;
  if (given !== 1) return null;
  return parts.runAt ? "once" : parts.cron ? "repeat" : "event";
};

const planLimitOf = (state: DemoState) => state.plans.find((plan) => plan.id === state.user.plan)?.limits.automations ?? 0;
const PLAN_NAME: Record<string, string> = { free: "Free", pro: "Pro", max: "Max" };

/** Every problem with the parts, each on its box, as the backend's check finds them. */
export function demoProblems(state: DemoState, parts: AutomationParts, automationId: string | null, now = Date.now()): AutomationProblem[] {
  const problems: AutomationProblem[] = [];
  const add = (step: AutomationProblem["step"], message: string, code: AutomationProblem["code"] = "invalid") => problems.push({ step, stepId: null, code, message });

  const stepped = (parts.steps ?? []).length > 0;
  if (!parts.title?.trim()) add("instruction", "Give it a title, a few words to know it by.");
  if (!parts.instruction?.trim())
    add("instruction", stepped ? "Write its purpose in one line, for example “Reply fast to urgent mail from my boss”." : "Write what Tex should do each time it runs.");

  const zone = parts.timezone || state.user.timezone;
  const kind = kindOfParts(parts);
  if (!kind) add("trigger", "Pick when it runs: once, on a schedule, or when something happens in an app.");
  if (kind !== "event" && kind !== null && !isTimeZone(zone)) add("trigger", `“${zone}” isn’t a time zone. Pick one from the list.`);
  if (kind === "once" && parts.runAt && Date.parse(parts.runAt) < now - 60_000) add("trigger", "That moment has passed. Pick a later one.", "past");
  if (kind === "repeat" && parts.cron && isTimeZone(zone)) {
    const gap = shortestGapMinutes(parts.cron, zone, new Date(now));
    if (gap === null) add("trigger", "This schedule can’t be read. Use the builder, or five fields such as 0 9 * * 1.");
    else if (gap < MIN_INTERVAL_MINUTES) add("trigger", `An automation can run at most every ${MIN_INTERVAL_MINUTES} minutes.`);
  }
  if (kind === "event" && parts.trigger) {
    const app = state.apps.find((item) => item.slug === parts.trigger!.app);
    if (!app) add("trigger", "Pick the app to watch.");
    else if (!app.availableOnPlan) add("trigger", `${app.name} isn’t on your plan. Upgrade to use it.`);
    else if (!app.connections.some((connection) => connection.status === "active")) add("trigger", `Connect ${app.name} first, under Integrations → Apps.`);
    else {
      const event = (DEMO_APP_EVENTS[app.slug] ?? []).find((item) => item.slug === parts.trigger!.event);
      if (!event) add("trigger", parts.trigger.event ? `${app.name} has no event “${parts.trigger.event}”. Pick one from the list.` : `Pick what should happen in ${app.name}.`);
      else
        for (const item of event.settings) {
          const value = parts.trigger.config?.[item.name];
          if (item.required && (value === undefined || value === null || value === "")) add("trigger", `Fill in “${item.title}”.`);
          else if (item.type === "integer" && value !== undefined && value !== "" && !Number.isInteger(Number(value))) add("trigger", `“${item.title}” must be a whole number.`);
        }
    }
  }

  if (stepped) problems.push(...stepProblems(state, parts.steps!));
  if (!stepped && (parts.apps ?? []).length > 10) add("apps", "At most 10 apps.");
  for (const slug of new Set(stepped ? [] : (parts.apps ?? []))) {
    const app = state.apps.find((item) => item.slug === slug);
    if (!app) add("apps", `There is no app “${slug}”.`);
    else if (!app.availableOnPlan) add("apps", `${app.name} isn’t on your plan.`);
    else if (!app.connections.some((connection) => connection.status === "active")) add("apps", `Connect ${app.name} first, or take it off the list.`);
  }

  if (parts.copyTo && !state.channels.some((link) => link.channel === parts.copyTo)) {
    add("results", `Link a ${titleCase(parts.copyTo)} chat first (Integrations → Chat apps), or keep the answers in the Automations chat only.`);
  }

  const counted = state.automations.filter((automation) => automation.id !== automationId && !(automation.kind === "once" && automation.lastRunAt)).length;
  const limit = planLimitOf(state);
  if (counted >= limit) {
    const plan = PLAN_NAME[state.user.plan] ?? state.user.plan;
    add(null, `Your ${plan} plan allows ${limit} automation${limit === 1 ? "" : "s"}, and ${limit === 1 ? "it is" : "they are"} used. Delete one or upgrade.`, "plan_limit");
  }
  return problems.sort((a, b) => STEPS.indexOf(a.step as (typeof STEPS)[number]) - STEPS.indexOf(b.step as (typeof STEPS)[number]));
}

/** When it would run: the moment, or the schedule's next three times. */
function nextRunsOf(state: DemoState, parts: AutomationParts): string[] {
  const kind = kindOfParts(parts);
  if (kind === "once" && parts.runAt) return [new Date(parts.runAt).toISOString()];
  if (kind === "repeat" && parts.cron) return (nextCronRuns(parts.cron, parts.timezone || state.user.timezone, 3) ?? []).map((at) => at.toISOString());
  return [];
}

export const checkAutomation: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const parts = partsFrom(body);
  const automationId = typeof body.automationId === "string" ? body.automationId : null;
  const problems = demoProblems(state, parts, automationId);
  return json({ ok: problems.length === 0, problems, kind: kindOfParts(parts), nextRuns: nextRunsOf(state, parts) });
};

/** A refused save: 403 when only the plan stands in the way, else 400 with every problem. */
function refuse(problems: AutomationProblem[]): HttpError {
  if (problems.every((problem) => problem.code === "plan_limit")) return new HttpError(403, "plan_limit", problems[0].message, { problems });
  return badRequest(problems.find((problem) => problem.code !== "plan_limit")!.message, { problems });
}

/** The draft open on the canvas, which must be open and, for a change, a change of this automation. */
function openDraft(state: DemoState, draftId: unknown, changeOf: string | null): AutomationDraft | null {
  if (typeof draftId !== "string" || !draftId) return null;
  const draft = state.drafts.find((item) => item.id === draftId);
  if (!draft) throw notFound("Draft not found");
  if (draft.status !== "open" || Date.parse(draft.expiresAt) <= Date.now()) throw new HttpError(409, "conflict", "This draft is no longer open", { status: draft.status });
  if (draft.changeOf !== changeOf)
    throw new HttpError(409, "conflict", changeOf ? "This draft isn’t a change of this automation" : "This draft changes an automation: save it on that automation");
  return draft;
}

function fill(automation: Automation, parts: AutomationParts, state: DemoState): Automation {
  const kind = kindOfParts(parts)!;
  const zone = parts.timezone || state.user.timezone;
  const steps = savedSteps(parts.steps ?? [], () => nextId(state, "s").replace(/[^a-z0-9_]/g, "").slice(0, 24));
  return Object.assign(automation, {
    steps,
    kind,
    title: parts.title!.trim(),
    instruction: parts.instruction!.trim(),
    runAt: parts.runAt ?? null,
    cron: parts.cron ?? null,
    timezone: kind === "event" ? (automation.timezone ?? zone) : zone,
    trigger: parts.trigger ? { app: parts.trigger.app, event: parts.trigger.event, config: parts.trigger.config ?? {} } : null,
    apps: steps.length ? appsOfSteps(steps) : [...new Set(parts.apps ?? [])],
    askFirst: parts.askFirst ?? "risky",
    copyTo: parts.copyTo ?? null,
    nextRunAt: nextRunsOf(state, parts)[0] ?? null,
  });
}

function markSaved(state: DemoState, draft: AutomationDraft | null, automationId: string): void {
  if (!draft) return;
  Object.assign(draft, { status: "saved", automationId, decidedAt: nowIso() });
  emit(state, "automation_draft.updated", draft);
}

export const createAutomation: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  if (typeof body.clientRequestId !== "string" || !body.clientRequestId) throw badRequest("clientRequestId is required");
  const seen = memoryOf(state).saves.get(body.clientRequestId);
  const before = seen && state.automations.find((automation) => automation.id === seen);
  if (before) return json(before, 200);
  const parts = partsFrom(body);
  const draft = openDraft(state, body.draftId, null);
  const problems = demoProblems(state, parts, null);
  if (problems.length) throw refuse(problems);
  const enabled = body.enabled !== false;
  const automation = fill(
    {
      id: nextId(state, "aut"),
      preset: null,
      enabled,
      pausedReason: enabled ? null : "user",
      lastRunAt: null,
      createdAt: nowIso(),
    } as Automation,
    parts,
    state,
  );
  if (!enabled) automation.nextRunAt = kindOfParts(parts) === "once" ? automation.nextRunAt : null;
  state.automations.push(automation);
  memoryOf(state).saves.set(body.clientRequestId, automation.id);
  markSaved(state, draft, automation.id);
  logActivity(state, { actor: "user", action: "automation_saved", summary: `Made the automation “${automation.title}”${enabled ? "" : ", paused"}` });
  emit(state, "automation.updated", automation);
  return json(automation, 201);
};

export const changeAutomation: Handler = async ({ state, request, params }) => {
  const automation = state.automations.find((item) => item.id === params.automationId);
  if (!automation) throw notFound("Automation not found");
  if (automation.preset === "pr_review") throw new HttpError(409, "conflict", "Pull-request review is changed on its own screen");
  if (automation.kind === "once" && automation.lastRunAt && !automation.nextRunAt) throw new HttpError(409, "conflict", "This reminder has run: it is finished");
  const body = await readJson(request);
  const parts = partsFrom(body);
  const draft = openDraft(state, body.draftId, automation.id);
  const problems = demoProblems(state, parts, automation.id);
  if (problems.length) throw refuse(problems);
  fill(automation, parts, state);
  if (typeof body.enabled === "boolean") Object.assign(automation, { enabled: body.enabled, pausedReason: body.enabled ? null : "user" });
  markSaved(state, draft, automation.id);
  logActivity(state, { actor: "user", action: "automation_changed", summary: `Changed the automation “${automation.title}”` });
  emit(state, "automation.updated", automation);
  return json(automation);
};

// ---------------------------------------------------------------- run once now

export const runAutomationNow: Handler = async ({ state, request, params }) => {
  const automation = state.automations.find((item) => item.id === params.automationId);
  if (!automation) throw notFound("Automation not found");
  if (automation.preset === "pr_review") throw new HttpError(409, "conflict", "Pull-request review runs on each pull request; it can’t be run once");
  if (automation.kind === "once" && automation.lastRunAt && !automation.nextRunAt) throw new HttpError(409, "conflict", "This reminder has run: it is finished");
  const body = await readJson(request);
  if (typeof body.clientRequestId !== "string" || !body.clientRequestId) throw badRequest("clientRequestId is required");
  const remembered = memoryOf(state);
  const key = `${automation.id}:${body.clientRequestId}`;
  const seen = remembered.runs.get(key);
  if (seen) return json({ automationId: automation.id, eventId: seen, queuedAt: nowIso() }, 202);
  if (balanceOf(state) <= 0) throw outOfCredits();
  const now = Date.now();
  remembered.testRunsAt = remembered.testRunsAt.filter((at) => at > now - HOUR_MS);
  if (remembered.testRunsAt.length >= TEST_RUNS_PER_HOUR) throw rateLimited();
  remembered.testRunsAt.push(now);

  const eventId = nextId(state, "evt");
  remembered.runs.set(key, eventId);
  const chat = automationsChat(state);
  postFromTex(state, chat.id, `🧪 Test run of “${automation.title}”, started by you. It runs once now, as a real run would; the schedule doesn’t move.`);
  schedule(state, TEST_RUN_ANSWER_MS, () => {
    if (automation.steps?.length) {
      // With steps: each step in turn, until one that asks first; the trail follows on the canvas.
      const run = demoStepRun(state, automation);
      const waiting = run.state === "waiting";
      postFromTex(
        state,
        automationsChat(state).id,
        `Test run: ${waiting ? "one email is urgent, and I drafted a reply. It waits for your OK before it is sent." : "every step ran."}\n\n${trailText(run)}`,
      );
      chargeUsage(state, { awake: 1 });
      return;
    }
    const answer =
      automation.kind === "event"
        ? `Test run: nothing happened in ${titleCase(automation.trigger?.app ?? "the app")} just now, so I used the latest one I could find. ${automation.instruction}`
        : `Test run: ${automation.instruction}`;
    postFromTex(state, automationsChat(state).id, answer);
    chargeUsage(state, { awake: 1 });
  });
  logActivity(state, { actor: "user", action: "automation_test_run", summary: `Ran “${automation.title}” once, as a test` });
  return json({ automationId: automation.id, eventId, queuedAt: nowIso() }, 202);
};

// ---------------------------------------------------------------- the person's own draft

export const createDraft: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const parts = partsFrom(body);
  const kind = kindOfParts(parts);
  if (!kind) throw badRequest("Pick when it runs: once, on a schedule, or when something happens in an app.");
  if (!parts.title?.trim() || !parts.instruction?.trim()) throw badRequest("Give it a title and an instruction first.");
  const changeOf = typeof body.changeOf === "string" && body.changeOf ? body.changeOf : null;
  if (changeOf && !state.automations.some((automation) => automation.id === changeOf)) throw badRequest("That automation isn’t there");
  const open = state.drafts.filter((draft) => draft.status === "open" && Date.parse(draft.expiresAt) > Date.now());
  const replaces = typeof body.replacesDraftId === "string" ? state.drafts.find((draft) => draft.id === body.replacesDraftId) : undefined;
  if (open.filter((draft) => draft.id !== replaces?.id).length >= 20) throw new HttpError(409, "conflict", "20 drafts are open already. Save or discard some first.");
  const createdAt = nowIso();
  const draftSteps = savedSteps((parts.steps ?? []).slice(0, 6), () => nextId(state, "s").slice(0, 24));
  const draft: AutomationDraft = {
    id: nextId(state, "drf"),
    status: "open",
    madeBy: "user",
    changeOf,
    kind,
    title: parts.title.trim(),
    instruction: parts.instruction.trim(),
    runAt: parts.runAt ?? null,
    cron: parts.cron ?? null,
    timezone: parts.timezone || state.user.timezone,
    trigger: parts.trigger ? { app: parts.trigger.app, event: parts.trigger.event, config: parts.trigger.config ?? {} } : null,
    apps: draftSteps.length ? appsOfSteps(draftSteps) : [...new Set(parts.apps ?? [])],
    askFirst: parts.askFirst ?? "risky",
    steps: draftSteps,
    copyTo: parts.copyTo ?? null,
    nextRunAt: nextRunsOf(state, parts)[0] ?? null,
    replacedBy: null,
    automationId: null,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + DRAFT_DAYS * 86_400_000).toISOString(),
    decidedAt: null,
  };
  state.drafts.unshift(draft);
  if (replaces && replaces.status === "open") {
    Object.assign(replaces, { status: "replaced", replacedBy: draft.id, decidedAt: createdAt });
    emit(state, "automation_draft.updated", replaces);
  }
  emit(state, "automation_draft.updated", draft);
  return json(draft, 201);
};
