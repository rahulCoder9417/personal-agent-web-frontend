import type { Automation, ChannelType } from "./api/client";

const numberFormat = new Intl.NumberFormat("en-US");

/** 1284 → "1,284" */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** 1 → "1 credit", 12 → "12 credits" */
export function formatCredits(value: number): string {
  return `${formatNumber(value)} ${Math.abs(value) === 1 ? "credit" : "credits"}`;
}

/** 1200 → "$12", 1250 → "$12.50" */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

// Written out rather than left to Intl, whose short names differ between runtimes ("Sep" vs "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** "2:14 PM" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "14 Oct" (adds the year when it isn't this one) */
export function formatDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** "Today", "Yesterday", "Tomorrow" or "Thu 1 Oct" */
export function formatDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (sameDay(date, now)) return "Today";
  if (sameDay(date, addDays(now, -1))) return "Yesterday";
  if (sameDay(date, addDays(now, 1))) return "Tomorrow";
  return `${DAYS[date.getDay()].slice(0, 3)} ${formatDate(iso, now)}`;
}

/** "Today, 2:14 PM" / "Thu 1 Oct, 2:14 PM" */
export function formatDateTime(iso: string, now = new Date()): string {
  return `${formatDay(iso, now)}, ${formatTime(iso)}`;
}

/** Time left until a deadline: "23h 41m left", "12m left", "expired" */
export function formatTimeLeft(iso: string, now = new Date()): string {
  const minutes = Math.floor((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "expired";
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m left`;
  return `${Math.floor(hours / 24)}d left`;
}

/** "just now", "5 min ago", "3h ago", "Yesterday", "12 Sep" */
export function formatAgo(iso: string, now = new Date()): string {
  const seconds = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400 && sameDay(new Date(iso), now)) return `${Math.floor(seconds / 3600)}h ago`;
  if (sameDay(new Date(iso), addDays(now, -1))) return "Yesterday";
  return formatDate(iso, now);
}

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  imessage: "iMessage",
  web: "Web",
};

export const AUTOMATION_KIND_LABEL: Record<Automation["kind"], string> = {
  once: "Once",
  repeat: "On repeat",
  event: "When something happens",
};

function clock(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

/**
 * Turns the common five-field cron shapes into words: "Every Monday · 9:00", "Weekdays · 8:00",
 * "Every day · 18:30", "Day 1 of the month · 9:00". Anything else is returned unchanged.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour) || month !== "*") return cron;
  const at = clock(Number(hour), Number(minute));

  if (dayOfMonth === "*" && dayOfWeek === "*") return `Every day · ${at}`;
  if (dayOfMonth === "*" && dayOfWeek === "1-5") return `Weekdays · ${at}`;
  if (dayOfMonth === "*" && (dayOfWeek === "0,6" || dayOfWeek === "6,0")) return `Weekends · ${at}`;
  if (dayOfMonth === "*" && /^[0-7](,[0-7])*$/.test(dayOfWeek)) {
    const names = dayOfWeek.split(",").map((d) => DAYS[Number(d) % 7]);
    return `Every ${names.join(", ")} · ${at}`;
  }
  if (/^\d+$/.test(dayOfMonth) && dayOfWeek === "*") return `Day ${dayOfMonth} of the month · ${at}`;
  return cron;
}

/** When an automation runs, in words. */
export function describeAutomationSchedule(automation: Automation, now = new Date()): string {
  if (automation.kind === "once") {
    return automation.runAt ? formatDateTime(automation.runAt, now) : "One time";
  }
  if (automation.kind === "repeat") {
    return automation.cron ? describeCron(automation.cron) : "On a schedule";
  }
  const trigger = automation.trigger;
  if (!trigger?.app) return "When something happens";
  return `${titleCase(trigger.app)} · ${humanizeEvent(trigger.event ?? "")}`;
}

/** What to show under "next run" for an automation. */
export function describeAutomationNext(automation: Automation, now = new Date()): string {
  if (!automation.enabled) {
    if (automation.pausedReason === "out_of_credits") return "Paused, out of credits";
    if (automation.pausedReason === "failures") return "Paused after failures";
    return "Paused by you";
  }
  if (automation.kind === "event") return `Watching ${titleCase(automation.trigger?.app ?? "your apps")}`;
  return automation.nextRunAt ? formatDateTime(automation.nextRunAt, now) : "Not scheduled";
}

/** "NEW_EMAIL" / "new_email" → "new email" */
export function humanizeEvent(event: string): string {
  return event.replace(/[_-]+/g, " ").trim().toLowerCase();
}

// Names that plain capitalising gets wrong.
const DISPLAY_NAMES: Record<string, string> = {
  crm: "CRM",
  github: "GitHub",
  hubspot: "HubSpot",
  googlecalendar: "Google Calendar",
  googledrive: "Google Drive",
  googlesheets: "Google Sheets",
  googledocs: "Google Docs",
  microsoftteams: "Microsoft Teams",
  onedrive: "OneDrive",
  clickup: "ClickUp",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  imessage: "iMessage",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

/** A slug as a display name: "hubspot" → "HubSpot", "crm" → "CRM", "google_calendar" → "Google Calendar". */
export function titleCase(value: string): string {
  const known = DISPLAY_NAMES[value.toLowerCase().replace(/[\s_-]+/g, "")];
  if (known) return known;
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Names as they read in a sentence: "Telegram"; "A or B"; "A, B or C". */
export function listNames(names: readonly string[], joiner: "or" | "and" = "or"): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`;
}

/** "AS" from "Aarav Shah" */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** 182_000 → "182 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
