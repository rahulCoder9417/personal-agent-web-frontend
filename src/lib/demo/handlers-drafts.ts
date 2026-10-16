// Drafts of automations for the demo account, with the backend's rules: Tex proposes one in the
// chat, it never runs, and only Save makes the automation. Open for 7 days; a saved, replaced,
// discarded or expired draft can't be saved (409, `details.status` says which); a full plan is 403.

import type { Automation, AutomationDraft, AutomationTrigger } from "@/lib/api/client";
import { titleCase } from "@/lib/format";
import { nowIso, truncate, upperFirst, type Handler } from "./context";
import { badRequest, HttpError, json, notFound, planLimit, readJson } from "./http";
import { DRAFT_DAYS } from "./seed";
import { emit, logActivity, nextId, type DemoState } from "./store";

const DAY_MS = 86_400_000;

/** An open draft whose 7 days are over is expired, as the backend's hourly job marks it. */
function settle(state: DemoState, draft: AutomationDraft): AutomationDraft {
  if (draft.status === "open" && Date.parse(draft.expiresAt) <= Date.now()) {
    draft.status = "expired";
    draft.decidedAt = draft.expiresAt;
    emit(state, "automation_draft.updated", draft);
  }
  return draft;
}

function findDraft(state: DemoState, draftId: string): AutomationDraft {
  const draft = state.drafts.find((item) => item.id === draftId);
  if (!draft) throw notFound("Draft not found");
  return settle(state, draft);
}

/** 409 for a draft that is no longer open, with what became of it. */
function notOpen(draft: AutomationDraft): HttpError {
  const message =
    draft.status === "saved"
      ? "This draft is already saved"
      : draft.status === "replaced"
        ? "Tex made a newer version of this draft"
        : draft.status === "discarded"
          ? "This draft was discarded"
          : "This draft expired";
  return new HttpError(409, "conflict", message, {
    status: draft.status,
    ...(draft.automationId ? { automationId: draft.automationId } : {}),
    ...(draft.replacedBy ? { replacedBy: draft.replacedBy } : {}),
  });
}

export const listDrafts: Handler = ({ state }) => {
  const open = state.drafts.map((draft) => settle(state, draft)).filter((draft) => draft.status === "open");
  return json({ items: [...open].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) });
};

export const getDraft: Handler = ({ state, params }) => json(findDraft(state, params.draftId));

/**
 * Saves a draft: the checks a save makes, then the automation, switched off when `enabled` is
 * false ("Save paused"). A change replaces the automation it changes.
 */
export const saveDraft: Handler = async ({ state, request, params }) => {
  const draft = findDraft(state, params.draftId);
  if (draft.status !== "open") throw notOpen(draft);
  const body = await readJson(request, { optional: true });
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") throw badRequest("enabled must be true or false");
  const enabled = body.enabled !== false;

  const limit = state.plans.find((plan) => plan.id === state.user.plan)?.limits.automations ?? 0;
  const counted = state.automations.filter((automation) => automation.id !== draft.changeOf).length;
  if (counted >= limit) throw planLimit(`Your ${state.user.plan} plan allows ${limit} automations. Delete one or upgrade, then save again.`);
  if (draft.kind === "once" && draft.runAt && Date.parse(draft.runAt) < Date.now() - 60_000) {
    throw badRequest("The time it was set for has passed. Ask Tex for a new time.");
  }
  if (draft.kind === "event" && draft.trigger) {
    const app = state.apps.find((item) => item.slug === draft.trigger!.app);
    if (!app?.connections.some((connection) => connection.status === "active")) throw badRequest(`Connect ${titleCase(draft.trigger.app)} first`);
  }

  const now = nowIso();
  const automation: Automation = {
    id: nextId(state, "aut"),
    kind: draft.kind,
    title: draft.title,
    instruction: draft.instruction,
    runAt: draft.runAt,
    cron: draft.cron,
    timezone: draft.timezone,
    trigger: draft.trigger,
    apps: [...draft.apps],
    copyTo: draft.copyTo,
    preset: null,
    enabled,
    pausedReason: enabled ? null : "user",
    nextRunAt: draft.kind === "event" ? null : draft.nextRunAt,
    lastRunAt: null,
    createdAt: now,
  };
  state.automations.push(automation);
  if (draft.changeOf) state.automations = state.automations.filter((item) => item.id !== draft.changeOf);
  Object.assign(draft, { status: "saved", automationId: automation.id, decidedAt: now });
  logActivity(state, { actor: "user", action: "automation_saved", summary: `Saved the automation “${draft.title}”${enabled ? "" : ", paused"}` });
  emit(state, "automation.updated", automation);
  emit(state, "automation_draft.updated", draft);
  return json({ draft, automation });
};

export const discardDraft: Handler = ({ state, params }) => {
  const draft = findDraft(state, params.draftId);
  if (draft.status !== "open") throw notOpen(draft);
  Object.assign(draft, { status: "discarded", decidedAt: nowIso() });
  emit(state, "automation_draft.updated", draft);
  return json(draft);
};

// ---------------------------------------------------------------- Tex proposes one

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "at 9", "at 10:30", "at 5pm" → [hour, minute] (9 when none is said). */
function timeOf(text: string): [number, number] {
  const at = /\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  if (!at) return [9, 0];
  let hour = Number(at[1]) % 24;
  if (at[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (at[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
  return [hour, Number(at[2] ?? 0) % 60];
}

/** The next time `hour:minute` comes round on one of `days` (0 = Sunday), in this machine's clock. */
function nextAt(hour: number, minute: number, days: number[]): string {
  const at = new Date();
  at.setHours(hour, minute, 0, 0);
  for (let step = 0; step < 8; step++) {
    if (at.getTime() > Date.now() && days.includes(at.getDay())) return at.toISOString();
    at.setDate(at.getDate() + 1);
  }
  return at.toISOString();
}

type Proposal = Pick<AutomationDraft, "kind" | "cron" | "runAt" | "nextRunAt" | "apps"> & { trigger: AutomationTrigger | null };

/**
 * What a request asks to be done later, as Tex would propose it: on an app event ("when … emails
 * me", "when a pull request opens"), on a schedule ("every Monday at 9", "each morning"), or null
 * when it isn't an automation. The demo's reading is rough on purpose; the real Tex reads anything.
 */
export function proposalOf(text: string): Proposal | null {
  const lower = text.toLowerCase();
  if (/\bwhen(ever)?\b/.test(lower)) {
    if (/\b(e-?mails?|mail)\b/.test(lower))
      return { kind: "event", cron: null, runAt: null, nextRunAt: null, apps: ["gmail"], trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: {} } };
    if (/\bpull requests?\b|\bprs?\b/.test(lower))
      return { kind: "event", cron: null, runAt: null, nextRunAt: null, apps: ["github"], trigger: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT", config: {} } };
    return null;
  }
  if (!/\b(every|each)\b/.test(lower)) return null;
  const [hour, minute] = timeOf(text);
  const named = DAYS.map((day, index) => (lower.includes(day) ? index : -1)).filter((index) => index >= 0);
  const days = named.length ? named : /\bweekdays?\b/.test(lower) ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  const dayField = days.length === 7 ? "*" : days.join(",") === "1,2,3,4,5" ? "1-5" : days.join(",");
  const apps = [/\b(pull requests?|prs?|github|repo)\b/.test(lower) && "github", /\b(e-?mails?|inbox|gmail)\b/.test(lower) && "gmail", /\b(calendar|meetings?)\b/.test(lower) && "googlecalendar"].filter(
    (app): app is string => Boolean(app),
  );
  return { kind: "repeat", cron: `${minute} ${hour} * * ${dayField}`, runAt: null, nextRunAt: nextAt(hour, minute, days), apps, trigger: null };
}

/** The web chat's line for a draft, word for word as the backend writes it. */
export const draftLine = (title: string) => `Here's a draft of "${title}". Nothing runs until you save it.`;

/** A short name for a request: what is to be done, without when. */
function titleOf(text: string): string {
  const after = text.split(",").slice(1).join(",").trim();
  const what = (after || text).replace(/^(please\s+)?/i, "").replace(/[.!?]+$/, "");
  return upperFirst(truncate(what, 48));
}

/**
 * Tex proposes the automation a request asks for: a draft (open 7 days, made in web chat, so no
 * copy goes elsewhere), and the line that carries it. Null when the request isn't an automation.
 * (Asked again, the real Tex names the draft it replaces; the seeded chat shows one replaced.)
 */
export function proposeDraft(state: DemoState, request: { text: string }): { draft: AutomationDraft; line: string } | null {
  const proposal = proposalOf(request.text);
  if (!proposal) return null;
  const createdAt = nowIso();
  const draft: AutomationDraft = {
    id: nextId(state, "drf"),
    status: "open",
    madeBy: "agent",
    changeOf: null,
    title: titleOf(request.text),
    instruction: upperFirst(request.text.trim()),
    timezone: state.user.timezone,
    copyTo: null,
    replacedBy: null,
    automationId: null,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + DRAFT_DAYS * DAY_MS).toISOString(),
    decidedAt: null,
    ...proposal,
    trigger: proposal.trigger ? { app: proposal.trigger.app ?? "", event: proposal.trigger.event ?? "", config: proposal.trigger.config ?? {} } : null,
  };
  state.drafts.unshift(draft);
  logActivity(state, { actor: "agent", action: "propose_automation", summary: `Proposed the automation “${draft.title}”` });
  emit(state, "automation_draft.updated", draft);
  return { draft, line: draftLine(draft.title) };
}
