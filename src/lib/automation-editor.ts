// Building and changing an automation by hand (phase 3 of `../beckend/docs/automations-flow-proposal.md`,
// HLD 5.4 "Building and changing one by hand"). The canvas keeps the five parts in a form of its
// own (`EditorParts`): a schedule as days and a time rather than a cron line, a moment as a date and
// a time in a time zone. This file turns that form into what the API takes (`AutomationParts`) and
// back, reads the API's problems box by box, and offers the templates an empty canvas starts from.
// Nothing here draws.

import type {
  Automation,
  AutomationAskFirst,
  AutomationDraft,
  AutomationParts,
  AutomationProblem,
  AutomationTrigger,
} from "./api/client";
import type { FlowSource, FlowStepId } from "./automation-flow";
import type { AutomationKind } from "./automations";

// ---------------------------------------------------------------- the form

/** How the trigger is set: once, on a schedule, or on an app event. Null: not picked yet. */
export type WhenMode = "once" | "schedule" | "event";

/**
 * A schedule as people think of it. `days`: on these weekdays (0 = Sunday; all seven is every
 * day) at `time`. `hours`: every `hours` hours, on the hour. `cron`: a cron line, for experts.
 */
export type ScheduleKind = "days" | "hours" | "cron";
export type Schedule = { kind: ScheduleKind; days: number[]; time: string; hours: number; cron: string };

export type CopyTo = AutomationParts["copyTo"];

export type EditorParts = {
  title: string;
  instruction: string;
  mode: WhenMode | null;
  /** Once: the day ("2026-10-20") and the time ("09:00"), in `timezone`. */
  date: string;
  time: string;
  schedule: Schedule;
  /** The time zone a moment or a schedule is in. An app event has none of its own. */
  timezone: string;
  event: { app: string; event: string; config: Record<string, unknown> };
  /** The apps its runs may use, by slug. Empty: any connected app. */
  apps: string[];
  askFirst: AutomationAskFirst;
  copyTo: CopyTo;
};

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** The shortest gap the platform allows between two runs. */
export const MIN_INTERVAL_MINUTES = 15;

const WHOLE = /^\d+$/;
const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- schedules and cron lines

/** "1-5" → [1..5]; "1,3" → [1,3]; "*" → all seven. Null for anything else. */
function dayList(field: string): number[] | null {
  if (field === "*") return [...ALL_DAYS];
  const days = new Set<number>();
  for (const part of field.split(",")) {
    const range = /^(\d)-(\d)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from > to || to > 7) return null;
      for (let day = from; day <= to; day++) days.add(day % 7);
    } else if (/^[0-7]$/.test(part)) days.add(Number(part) % 7);
    else return null;
  }
  return [...days].sort((a, b) => a - b);
}

/** The weekdays field of a cron line: "*" for all seven, "1-5" for the working week, else a list. */
function dayField(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "*";
  if (sorted.join(",") === "1,2,3,4,5") return "1-5";
  return sorted.join(",");
}

/** A schedule as a cron line, in its time zone: "30 8 * * 1-5", or every 4 hours on the hour. */
export function scheduleToCron(schedule: Schedule): string {
  if (schedule.kind === "cron") return schedule.cron.trim().replace(/\s+/g, " ");
  if (schedule.kind === "hours") {
    const every = Math.max(1, Math.round(schedule.hours) || 1);
    return every === 1 ? "0 * * * *" : `0 */${every} * * *`;
  }
  const [hour, minute] = (schedule.time || "09:00").split(":").map(Number);
  const days = schedule.days.length ? schedule.days : [...ALL_DAYS];
  return `${minute || 0} ${hour || 0} * * ${dayField(days)}`;
}

const DEFAULT_SCHEDULE: Schedule = { kind: "days", days: [...ALL_DAYS], time: "09:00", hours: 4, cron: "" };

/**
 * A cron line as the builder's choices: days and a time, every N hours, or (any other shape) the
 * line itself under "cron". The other choices keep sensible values, so switching costs nothing.
 */
export function cronToSchedule(cron: string): Schedule {
  const line = cron.trim().replace(/\s+/g, " ");
  const base: Schedule = { ...DEFAULT_SCHEDULE, cron: line };
  const parts = line.split(" ");
  if (parts.length !== 5) return { ...base, kind: "cron" };
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== "*" || month !== "*") return { ...base, kind: "cron" };
  if (minute === "0" && dayOfWeek === "*") {
    if (hour === "*") return { ...base, kind: "hours", hours: 1 };
    const every = /^\*\/(\d+)$/.exec(hour);
    if (every && Number(every[1]) >= 1 && Number(every[1]) <= 23) return { ...base, kind: "hours", hours: Number(every[1]) };
  }
  if (WHOLE.test(minute) && WHOLE.test(hour) && Number(minute) < 60 && Number(hour) < 24) {
    const days = dayList(dayOfWeek);
    if (days?.length) return { ...base, kind: "days", days, time: `${pad(Number(hour))}:${pad(Number(minute))}` };
  }
  return { ...base, kind: "cron" };
}

// ---------------------------------------------------------------- time zones

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Whether the runtime knows this time zone ("Asia/Kolkata" yes, "Mars/Base" no). */
export function isTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    zoneFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

/** The wall clock in `timeZone` at a moment. */
export function zonedParts(at: Date | number, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(zoneFormatter(timeZone).formatToParts(at).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: DAY_SHORT.indexOf(parts.weekday as (typeof DAY_SHORT)[number]),
  };
}

/** Minutes `timeZone` is ahead of UTC at a moment (330 for Kolkata). */
function offsetMinutes(at: number, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/** The moment a wall-clock time in `timeZone` falls on, in milliseconds. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMinutes(guess, timeZone);
  const at = guess - first * 60_000;
  const second = offsetMinutes(at, timeZone);
  return second === first ? at : guess - second * 60_000;
}

/** "2026-10-20" and "09:00" in `timeZone` → an ISO moment. Null when either is incomplete. */
export function momentOf(date: string, time: string, timeZone: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t || !isTimeZone(timeZone)) return null;
  return new Date(zonedToUtc(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]), timeZone)).toISOString();
}

/** An ISO moment as the day and the time it is in `timeZone`. */
export function wallClock(iso: string, timeZone: string): { date: string; time: string } {
  const zone = isTimeZone(timeZone) ? timeZone : "UTC";
  const p = zonedParts(Date.parse(iso), zone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

// ---------------------------------------------------------------- when a cron line runs

/** One field of a cron line as the numbers it allows. Null when it can't be read. */
function cronField(field: string, min: number, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) return null;
    let from = min;
    let to = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-").map(Number);
      from = a;
      to = b ?? (m[2] ? max : a);
    }
    if (from < min || to > max || from > to) return null;
    for (let n = from; n <= to; n += step) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The next `count` times a five-field cron line runs after `from`, in `timeZone`. Null when the
 * line can't be read. (The server's own answer is what the canvas shows; this serves the demo.)
 */
export function nextCronRuns(cron: string, timeZone: string, count: number, from = new Date()): Date[] | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || !isTimeZone(timeZone)) return null;
  const minutes = cronField(fields[0], 0, 59);
  const hours = cronField(fields[1], 0, 23);
  const doms = cronField(fields[2], 1, 31);
  const months = cronField(fields[3], 1, 12);
  const dowsRaw = cronField(fields[4], 0, 7);
  if (!minutes || !hours || !doms || !months || !dowsRaw) return null;
  const dows = new Set(dowsRaw.map((d) => d % 7));
  const anyDom = fields[2] === "*";
  const anyDow = fields[4] === "*";
  const start = zonedParts(from, timeZone);
  const runs: Date[] = [];
  for (let offset = 0; offset < 400 && runs.length < count; offset++) {
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const [y, mo, d, wd] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), day.getUTCDay()];
    if (!months.includes(mo)) continue;
    const domOk = doms.includes(d);
    const dowOk = dows.has(wd);
    const dayOk = anyDom && anyDow ? true : anyDom ? dowOk : anyDow ? domOk : domOk || dowOk;
    if (!dayOk) continue;
    for (const h of hours) {
      for (const mi of minutes) {
        const at = zonedToUtc(y, mo, d, h, mi, timeZone);
        if (at > from.getTime() && !runs.some((run) => run.getTime() === at)) runs.push(new Date(at));
        if (runs.length >= count) break;
      }
      if (runs.length >= count) break;
    }
  }
  return runs.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

/** The shortest gap between two runs, in minutes, over the next 50. Null when it can't be read. */
export function shortestGapMinutes(cron: string, timeZone: string, from = new Date()): number | null {
  const runs = nextCronRuns(cron, timeZone, 50, from);
  if (!runs) return null;
  let gap = Infinity;
  for (let i = 1; i < runs.length; i++) gap = Math.min(gap, (runs[i].getTime() - runs[i - 1].getTime()) / 60_000);
  return gap;
}

// ---------------------------------------------------------------- the form from and to the API

/** Tomorrow's date in `timeZone`, for a new "once". */
function tomorrow(timeZone: string, now: Date): string {
  return wallClock(new Date(now.getTime() + 86_400_000).toISOString(), timeZone).date;
}

/** An empty canvas: nothing picked yet, in the person's time zone. */
export function emptyEditor(timeZone: string, now = new Date()): EditorParts {
  const zone = isTimeZone(timeZone) ? timeZone : "UTC";
  return {
    title: "",
    instruction: "",
    mode: null,
    date: tomorrow(zone, now),
    time: "09:00",
    schedule: { ...DEFAULT_SCHEDULE },
    timezone: zone,
    event: { app: "", event: "", config: {} },
    apps: [],
    askFirst: "risky",
    copyTo: null,
  };
}

/** What an automation or a draft is made of, as the editor starts from it. */
export type EditorSource = Pick<Automation, "kind" | "title" | "instruction" | "runAt" | "cron" | "timezone" | "copyTo" | "askFirst"> & {
  trigger?: AutomationTrigger | null;
  apps?: readonly string[] | null;
};

/** The form for an automation or a draft, as it is now. */
export function editorFrom(source: EditorSource | Pick<AutomationDraft, keyof EditorSource>, accountZone: string, now = new Date()): EditorParts {
  const zone = source.timezone && isTimeZone(source.timezone) ? source.timezone : isTimeZone(accountZone) ? accountZone : "UTC";
  const empty = emptyEditor(zone, now);
  const parts: EditorParts = {
    ...empty,
    title: source.title,
    instruction: source.instruction,
    apps: [...(source.apps ?? [])],
    askFirst: source.askFirst ?? "risky",
    copyTo: source.copyTo ?? null,
  };
  if (source.kind === "once" && source.runAt) return { ...parts, mode: "once", ...wallClock(source.runAt, zone) };
  if (source.kind === "repeat" && source.cron) return { ...parts, mode: "schedule", schedule: cronToSchedule(source.cron) };
  if (source.kind === "event" && source.trigger)
    return { ...parts, mode: "event", event: { app: source.trigger.app ?? "", event: source.trigger.event ?? "", config: { ...(source.trigger.config ?? {}) } } };
  return parts;
}

/** The settings of an app event without the empty ones (a field left blank is not set). */
function filledConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== "" && value !== undefined && value !== null));
}

/** The form as the API takes it: one of `runAt`, `cron` and `trigger` (none while nothing is picked). */
export function toParts(editor: EditorParts): AutomationParts {
  const base: AutomationParts = {
    title: editor.title.trim(),
    instruction: editor.instruction.trim(),
    runAt: null,
    cron: null,
    timezone: editor.timezone || null,
    trigger: null,
    apps: [...new Set(editor.apps)],
    askFirst: editor.askFirst,
    copyTo: editor.copyTo ?? null,
  };
  if (editor.mode === "once") return { ...base, runAt: momentOf(editor.date, editor.time, editor.timezone) };
  if (editor.mode === "schedule") return { ...base, cron: scheduleToCron(editor.schedule) || null };
  if (editor.mode === "event")
    return { ...base, trigger: editor.event.app ? { app: editor.event.app, event: editor.event.event, config: filledConfig(editor.event.config) } : null };
  return base;
}

/** A key that is the same for two forms that would save the same automation. */
export function partsKey(editor: EditorParts): string {
  return JSON.stringify(toParts(editor));
}

/** Whether the form says something other than what it started from. */
export function isDirty(editor: EditorParts, start: EditorParts): boolean {
  return partsKey(editor) !== partsKey(start);
}

/** What the form would make: once, a schedule, an app event, or nothing yet. */
export function kindOf(editor: Pick<EditorParts, "mode">): AutomationKind | null {
  return editor.mode === "once" ? "once" : editor.mode === "schedule" ? "repeat" : editor.mode === "event" ? "event" : null;
}

/**
 * The form as the flow draws it (`automationFlow`), so the canvas shows what is being built. While
 * no trigger is picked it draws as "once"; the trigger box then says to pick one.
 */
export function previewSource(editor: EditorParts, base: Partial<FlowSource> = {}): FlowSource {
  const parts = toParts(editor);
  return {
    ...base,
    kind: kindOf(editor) ?? "once",
    title: parts.title ?? "",
    instruction: parts.instruction ?? "",
    runAt: parts.runAt ?? null,
    cron: parts.cron ?? null,
    timezone: parts.timezone ?? null,
    trigger: parts.trigger ? { app: parts.trigger.app, event: parts.trigger.event, config: parts.trigger.config ?? {} } : null,
    apps: parts.apps ?? [],
    askFirst: editor.askFirst,
    copyTo: parts.copyTo ?? null,
    preset: null,
    nextRunAt: base.nextRunAt ?? null,
    lastRunAt: base.lastRunAt ?? null,
  };
}

// ---------------------------------------------------------------- problems

export type StepProblems = {
  /** Each box's problems, in the server's words. */
  byStep: Map<FlowStepId, string[]>;
  /** Problems with the automation as a whole (the plan's limit). */
  general: AutomationProblem[];
  /** The plan's automations are used up. */
  planLimit: boolean;
};

/** The server's problems, box by box. */
export function problemsByStep(problems: readonly AutomationProblem[] | null | undefined): StepProblems {
  const byStep = new Map<FlowStepId, string[]>();
  const general: AutomationProblem[] = [];
  for (const problem of problems ?? []) {
    if (problem.step) byStep.set(problem.step, [...(byStep.get(problem.step) ?? []), problem.message]);
    else general.push(problem);
  }
  return { byStep, general, planLimit: (problems ?? []).some((problem) => problem.code === "plan_limit") };
}

/** The problems a refused save carried (`details.problems` of a 400), or null when it carried none. */
export function problemsOfError(details: Record<string, unknown> | undefined): AutomationProblem[] | null {
  const problems = details?.problems;
  if (!Array.isArray(problems)) return null;
  return problems.filter(
    (item): item is AutomationProblem =>
      typeof item === "object" && item !== null && typeof (item as AutomationProblem).message === "string",
  );
}

// ---------------------------------------------------------------- templates for an empty canvas

export type EditorTemplate = {
  id: string;
  name: string;
  /** In one line, what it does. */
  blurb: string;
  /** The app it needs connected, by slug. */
  app?: string;
  fill: (editor: EditorParts) => EditorParts;
};

const days = (list: readonly number[], time: string): Schedule => ({ ...DEFAULT_SCHEDULE, kind: "days", days: [...list], time });

/** Ready-made starts for the empty canvas. Each fills the form; everything can be changed after. */
export const EDITOR_TEMPLATES: readonly EditorTemplate[] = [
  {
    id: "daily-briefing",
    name: "Daily briefing at 8",
    blurb: "Every morning: today’s meetings and the emails that need you.",
    app: "googlecalendar",
    fill: (e) => ({
      ...e,
      mode: "schedule",
      schedule: days(ALL_DAYS, "08:00"),
      title: "Daily briefing",
      instruction: "Give me a short briefing for today: my meetings from Google Calendar, and the unread emails that need an answer from me.",
      apps: ["googlecalendar", "gmail"],
    }),
  },
  {
    id: "weekly-prs",
    name: "Pull requests on Monday at 9",
    blurb: "Each Monday, the pull requests still open in your repos.",
    app: "github",
    fill: (e) => ({
      ...e,
      mode: "schedule",
      schedule: days([1], "09:00"),
      title: "Open pull requests",
      instruction: "List my open pull requests on GitHub, oldest first, with who is waiting on whom.",
      apps: ["github"],
    }),
  },
  {
    id: "email-from",
    name: "An email from someone",
    blurb: "When a new email arrives, sum it up in two lines.",
    app: "gmail",
    fill: (e) => ({
      ...e,
      mode: "event",
      event: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: {} },
      title: "New email, in two lines",
      instruction: "Say who wrote and what they want, in two lines. If it isn't from my manager, say nothing more.",
      apps: ["gmail"],
    }),
  },
  {
    id: "every-4-hours",
    name: "Check something every 4 hours",
    blurb: "A look every few hours, and a word only when something changed.",
    fill: (e) => ({
      ...e,
      mode: "schedule",
      schedule: { ...DEFAULT_SCHEDULE, kind: "hours", hours: 4 },
      title: "Check every 4 hours",
      instruction: "Check my unread Slack mentions and tell me only about the ones that need an answer.",
      apps: ["slack"],
    }),
  },
];
