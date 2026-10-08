import type { ActivityEntry } from "@/lib/api/client";
import { splitCrewLine, type SpecialistId } from "@/lib/crew";
import { formatDate, formatDay, humanizeEvent } from "@/lib/format";
import { memoryHref } from "@/lib/memory";

export type ActivityFilter = "all" | "tex" | "crew" | "you" | "memory" | "automations" | "approvals";

/** What Tex and the person did with the shared memory. */
const MEMORY_ACTIONS: ReadonlySet<string> = new Set(["remember", "recall", "forget", "memory_refused", "memory_deleted", "memories_cleared"]);

export function matchesFilter(entry: ActivityEntry, filter: ActivityFilter): boolean {
  switch (filter) {
    case "tex":
      return entry.actor === "agent";
    case "crew":
      // What the specialists reported while they worked.
      return Boolean(entry.crew);
    case "you":
      return entry.actor === "user";
    case "memory":
      return MEMORY_ACTIONS.has(entry.action);
    case "automations":
      return entry.action.toLowerCase().includes("automation");
    case "approvals":
      return entry.action.toLowerCase().includes("approval");
    default:
      return true;
  }
}

export type ActivityDay = { key: string; label: string; entries: ActivityEntry[] };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today · Thu 1 Oct", "Yesterday · Wed 30 Sep", otherwise just "Sat 12 Sep". */
function dayLabel(iso: string, now: Date): string {
  const named = formatDay(iso, now);
  if (named !== "Today" && named !== "Yesterday") return named;
  return `${named} · ${WEEKDAYS[new Date(iso).getDay()]} ${formatDate(iso, now)}`;
}

/** Groups entries (already newest first) under one heading per calendar day, keeping their order. */
export function groupByDay(entries: ActivityEntry[], now = new Date()): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (const entry of entries) {
    const key = dayKey(new Date(entry.createdAt));
    const last = days[days.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, label: dayLabel(entry.createdAt, now), entries: [entry] });
  }
  return days;
}

/** Credits charged by entries from today. */
export function creditsToday(entries: ActivityEntry[], now = new Date()): number {
  const today = dayKey(now);
  return entries.reduce(
    (sum, entry) => (dayKey(new Date(entry.createdAt)) === today ? sum + (entry.creditsCharged ?? 0) : sum),
    0,
  );
}

// ---------------------------------------------------------------- one entry, in words

const ACTOR_NAME: Record<ActivityEntry["actor"], string> = {
  agent: "Tex",
  user: "You",
  system: "Automation",
  admin: "Textcrew team",
};

// Actions whose name alone doesn't say what happened. Everything else reads fine as it is.
const ACTION_LABEL: Record<string, string> = {
  read_page_refused: "Blocked a page Scout wasn’t given",
  crew_progress: "progress",
  pr_review_requested: "pull-request review asked for",
  pr_review_skipped: "pull-request review skipped",
  pr_review_enabled: "pull-request review turned on",
  pr_review_disabled: "pull-request review turned off",
  chat_started: "started a new chat",
  // Memory. The row puts who did it in front: "Tex · remembered", "You · deleted a memory".
  remember: "remembered",
  recall: "looked up memory",
  forget: "forgot",
  memory_refused: "refused to save",
  memory_deleted: "deleted a memory",
  memories_cleared: "cleared memory",
};

/** What an action is called in the log: "read_page_refused" → "Blocked a page Scout wasn’t given". */
export function actionLabel(action: string, summary = ""): string {
  // `forget` covers both removing a memory and correcting one; the backend's summary says which.
  if (action === "forget" && /^corrected\b/i.test(summary)) return "corrected a memory";
  return ACTION_LABEL[action] ?? humanizeEvent(action);
}

/**
 * Where an entry's memory can be seen: the Memory screen, opened on it. Only for a memory that
 * still exists. The log never holds a memory's text, so one that was deleted has nothing to show.
 */
export function memoryLink(entry: Pick<ActivityEntry, "memoryId">, existing: ReadonlySet<string>): string | null {
  return entry.memoryId && existing.has(entry.memoryId) ? memoryHref(entry.memoryId) : null;
}

export type ActivityLine = {
  /** The specialist the entry belongs to, when the backend names one. */
  crew: SpecialistId | null;
  /** Who did it, as the row names them: "Scout", "Tex", "You". */
  who: string;
  /** What kind of entry it is, for the line under the summary. */
  label: string;
  summary: string;
};

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * How an entry reads. One that belongs to a crew member is shown as that member's: its name moves
 * from the front of the summary ("Scout: reading 4 pages") to where the row says who did it.
 */
export function describeActivity(entry: ActivityEntry): ActivityLine {
  // After "Tex · " the label is the middle of a line, so it starts small.
  const label = lowerFirst(actionLabel(entry.action, entry.summary));
  if (!entry.crew) return { crew: null, who: ACTOR_NAME[entry.actor], label, summary: entry.summary };
  const line = splitCrewLine(entry.summary, entry.crew);
  return { crew: entry.crew, who: line.name, label, summary: upperFirst(line.text) };
}
