import type { ActivityEntry } from "@/lib/api/client";
import { formatDate, formatDay } from "@/lib/format";

export type ActivityFilter = "all" | "tex" | "you" | "automations" | "approvals";

export function matchesFilter(entry: ActivityEntry, filter: ActivityFilter): boolean {
  switch (filter) {
    case "tex":
      return entry.actor === "agent";
    case "you":
      return entry.actor === "user";
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
