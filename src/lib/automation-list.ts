// The Automations list, in words and marks: the line under the page's title, each row's stack of
// logos, its line, its last run with a dot, what needs the person (an app to connect, a pause the
// system made, a step waiting for an OK), the filters and the search. Nothing here draws.

import type { Automation, AutomationRun } from "./api/client";
import type { AppLink } from "./automation-apps";
import { reviewedRepo } from "./automation-flow";
import { stepApps } from "./automation-steps";
import { describeAutomationTimes, describeAutomationWhen } from "./automations";
import { formatAgo, listNames, titleCase } from "./format";

// ---------------------------------------------------------------- the stack of logos

/** The marks that aren't apps: a schedule's clock, a moment's, Tex, Patch, the Automations chat. */
export const MARK_NAMES: Record<string, string> = { schedule: "Schedule", once: "Once", tex: "Tex", patch: "Patch", chat: "Automations chat" };

/** A mark's name: the app's own (from the catalog, when given), else the mark's or the slug's. */
export function markName(slug: string, names?: ReadonlyMap<string, string>): string {
  return names?.get(slug) ?? MARK_NAMES[slug] ?? titleCase(slug);
}

/**
 * What an automation is made of, in the order it runs, as marks: the trigger (a schedule's clock, a
 * moment's, or the app it watches), then each step's app (Tex for a Tex step, after the apps it
 * reads), or for one instruction the apps it may use and then Tex. Pull-request review is GitHub
 * and Patch. Each mark once.
 */
export function rowApps(automation: Pick<Automation, "kind" | "trigger" | "preset" | "apps" | "steps">): string[] {
  if (automation.preset === "pr_review") return ["github", "patch"];
  const trigger = automation.kind === "repeat" ? "schedule" : automation.kind === "once" ? "once" : automation.trigger?.app;
  const steps = automation.steps ?? [];
  const middle = steps.length
    ? steps.flatMap((step) => (step.type === "action" ? (step.app ? [step.app] : []) : [...step.readApps, "tex"]))
    : [...(automation.apps ?? []), "tex"];
  return dedupe([trigger, ...middle]);
}

function dedupe(slugs: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    if (!slug) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export type LogoStack = {
  /** The marks drawn, in order. */
  shown: string[];
  /** How many more there are, on a "+N" tile; 0 for none. */
  more: number;
  /** Every mark, each once, in order: for the tooltip and the screen reader. */
  all: string[];
};

/**
 * The logos of a row, overlapping: each mark once and in order. With more than `max` (3), the
 * first two and a "+N" tile for the rest, so the stack is never wider than three.
 */
export function logoStack(marks: readonly string[], max = 3): LogoStack {
  const all = dedupe(marks);
  if (all.length <= max) return { shown: all, more: 0, all };
  const shown = all.slice(0, Math.max(1, max - 1));
  return { shown, more: all.length - shown.length, all };
}

/** "Uses Schedule, Gmail and Tex": what a stack says to a screen reader. Its tooltip is the names with dots. */
export function stackLabel(stack: LogoStack, names?: ReadonlyMap<string, string>): { label: string; title: string } {
  const all = stack.all.map((slug) => markName(slug, names));
  return { label: all.length ? `Uses ${listNames(all, "and")}` : "Uses no apps", title: all.join(" · ") };
}

// ---------------------------------------------------------------- a row's words

/** When it runs, short: "your time" is left out (the page's foot says whose time it is). */
export function shortWhen(automation: Parameters<typeof describeAutomationWhen>[0], accountZone?: string | null, now = new Date()): string {
  return describeAutomationWhen(automation, accountZone, now).replace(/, your time$/, "");
}

/** What it does, in a few words: the instruction's first line, or its steps and apps. */
export function rowWhat(automation: Pick<Automation, "preset" | "instruction" | "steps">): string {
  if (automation.preset === "pr_review") return "Patch comments on it";
  const steps = automation.steps ?? [];
  if (steps.length) {
    const apps = stepApps(steps.map((step) => ({ type: step.type, app: step.app ?? "", readApps: step.readApps })));
    const count = `${steps.length} step${steps.length === 1 ? "" : "s"}`;
    if (apps.length === 0) return `${count} with Tex`;
    return apps.length <= 2 ? `${count} with ${listNames(apps.map(titleCase), "and")}` : `${count} across ${apps.length} apps`;
  }
  const first = automation.instruction.trim().split(/\n/)[0]?.trim() ?? "";
  return first.length > 90 ? `${first.slice(0, 89)}…` : first;
}

/** The line under a row's name: when it runs, and what it does. */
export function rowLine(automation: Parameters<typeof describeAutomationWhen>[0] & Pick<Automation, "instruction" | "steps">, accountZone?: string | null, now = new Date()): string {
  const when = automation.preset === "pr_review" ? "When a pull request opens" : shortWhen(automation, accountZone, now);
  const what = rowWhat(automation);
  return what ? `${when} · ${what}` : when;
}

/** A row's name: its title, or for pull-request review "Review pull requests" (the repo is a chip beside it). */
export function rowTitle(automation: Pick<Automation, "title" | "preset">): string {
  return automation.preset === "pr_review" ? "Review pull requests" : automation.title;
}

/** The repo a pull-request review watches, for its mono chip. */
export function rowRepo(automation: Pick<Automation, "preset" | "trigger">): string | null {
  return automation.preset === "pr_review" ? reviewedRepo(automation) : null;
}

// ---------------------------------------------------------------- the last run

export type RunTone = "ok" | "warn" | "danger" | "muted" | "running";

export type RunStatus = {
  tone: RunTone;
  text: string;
  /** Waiting for the person's OK on a step: the approval to review. */
  approvalId?: string | null;
};

/**
 * The last run in a few words, with its dot: green when it ran, amber while a step waits for the
 * person's OK (with the approval to review), red when it failed, grey when it stopped on a
 * condition or hasn't run yet. `run` is the latest run of one with steps, when its runs are in.
 */
export function lastRunStatus(
  automation: Pick<Automation, "preset" | "enabled" | "kind" | "nextRunAt" | "lastRunAt" | "pausedReason">,
  run: Pick<AutomationRun, "state" | "startedAt" | "stopReason" | "steps"> | null | undefined,
  now = new Date(),
): RunStatus {
  const ago = (iso: string) => {
    const text = formatAgo(iso, now);
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  if (run) {
    switch (run.state) {
      case "waiting":
        return { tone: "warn", text: "Waiting for your OK", approvalId: run.steps.find((step) => step.state === "waiting")?.approvalId ?? null };
      case "running":
        return { tone: "running", text: "Running now" };
      case "failed":
        return { tone: "danger", text: `${ago(run.startedAt)} · failed` };
      case "stopped": {
        const why = run.stopReason?.trim();
        return { tone: "muted", text: `${ago(run.startedAt)} · ${why && why.length <= 40 ? why.replace(/\.$/, "") : "stopped"}` };
      }
      case "done":
        return { tone: "ok", text: ago(run.startedAt) };
      default:
        return { tone: "muted", text: ago(run.startedAt) };
    }
  }
  if (!automation.lastRunAt) return { tone: "muted", text: automation.preset === "pr_review" ? "No review yet" : "Not yet" };
  if (!automation.enabled && automation.pausedReason === "failures") return { tone: "danger", text: `${ago(automation.lastRunAt)} · failed` };
  return { tone: "ok", text: describeAutomationTimes(automation, now).last };
}

/** When it runs next, short: "Tomorrow, 9:00 AM", "Each time it happens", "Paused". */
export function nextRunText(automation: Parameters<typeof describeAutomationTimes>[0], now = new Date()): string {
  if (!automation.enabled) return "Paused";
  if (automation.preset === "pr_review") return "On the next pull request";
  return describeAutomationTimes(automation, now).next;
}

// ---------------------------------------------------------------- what needs the person

export type NeedsYou = {
  /** The amber chip beside the name: "Connect Notion", "Reconnect Google Drive", "Out of credits". */
  label: string;
  /** The app to connect, when that is the way out. */
  app?: AppLink;
};

/**
 * What an automation needs from the person before it can run as it should, most pressing first:
 * an app it uses to connect or reconnect (or one the plan no longer has), a pause the system made
 * (out of credits, after failures), or a step waiting for an OK. Null when nothing does.
 */
export function needsYou(automation: Pick<Automation, "enabled" | "pausedReason">, broken: readonly AppLink[], waiting = false): NeedsYou | null {
  const app = broken[0];
  if (app) {
    const label = app.health === "reconnect" ? `Reconnect ${app.name}` : app.health === "plan" ? `${app.name} isn’t on your plan` : `Connect ${app.name}`;
    return { label, app };
  }
  if (!automation.enabled && automation.pausedReason === "out_of_credits") return { label: "Out of credits" };
  if (!automation.enabled && automation.pausedReason === "failures") return { label: "Paused after failures" };
  if (waiting) return { label: "Waiting for your OK" };
  return null;
}

// ---------------------------------------------------------------- filters and search

export type ListFilter = "all" | "schedule" | "event" | "needs";

/** On a clock (once or on a schedule), or when something happens (an app event, pull-request review). */
export function filterKind(automation: Pick<Automation, "kind">): "schedule" | "event" {
  return automation.kind === "event" ? "event" : "schedule";
}

/** Whether a row shows under a filter. `needs` says whether it needs the person (`needsYou`). */
export function inFilter(automation: Pick<Automation, "kind">, filter: ListFilter, needs: boolean): boolean {
  if (filter === "all") return true;
  if (filter === "needs") return needs;
  return filterKind(automation) === filter;
}

/** Whether a row has every word typed: in its name, its repo, its apps, its instruction or when it runs. */
export function matchesSearch(automation: Pick<Automation, "title" | "instruction" | "preset" | "trigger">, query: string, extra: readonly string[] = []): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [automation.title, rowTitle(automation), automation.instruction, rowRepo(automation) ?? "", ...extra].join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}

// ---------------------------------------------------------------- the line under the title

/** "6 running · 1 paused · 7 of 50 on your Max plan". A finished reminder is neither running nor paused. */
export function listHeadline(
  automations: readonly Pick<Automation, "enabled" | "kind" | "lastRunAt" | "nextRunAt">[],
  plan: { planName: string; limit: number } | null,
): string {
  const finished = (automation: (typeof automations)[number]) => automation.kind === "once" && Boolean(automation.lastRunAt) && !automation.nextRunAt;
  const live = automations.filter((automation) => !finished(automation));
  const running = live.filter((automation) => automation.enabled).length;
  const paused = live.length - running;
  const parts = automations.length === 0 ? ["None yet"] : [`${running} running`, ...(paused ? [`${paused} paused`] : [])];
  if (plan) parts.push(`${automations.length} of ${plan.limit} on your ${plan.planName} plan`);
  return parts.join(" · ");
}
