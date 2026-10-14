// Automations in plain words: the three kinds, the ready-made requests, and what one automation
// says about itself (when it runs, whether it is on, its last and next run, what it costs).
// The API gives a kind, a cron line or a trigger name; nobody should have to read those.

import type { Automation } from "./api/client";
import { chatDraftHref } from "./chat-link";
import { AUTOMATION_KIND_LABEL, formatAgo, formatDateTime, formatDay, formatTime, humanizeEvent, listNames, titleCase } from "./format";

export type AutomationKind = Automation["kind"];

// ---------------------------------------------------------------- the three kinds

export type KindGuide = {
  kind: AutomationKind;
  name: string;
  /** When this kind runs, in one line. */
  when: string;
  /** A request that makes one, as someone would type it to Tex. */
  example: string;
};

/** The three kinds of automation, each with the sentence that makes one. */
export const AUTOMATION_KINDS: readonly KindGuide[] = [
  {
    kind: "once",
    name: AUTOMATION_KIND_LABEL.once,
    when: "One time, at the moment you name: a reminder, a follow-up, a job for later.",
    example: "Remind me tomorrow at 10am to call the bank.",
  },
  {
    kind: "repeat",
    name: AUTOMATION_KIND_LABEL.repeat,
    when: "Again and again, on a schedule: every day, every weekday, every Monday.",
    example: "Every morning at 9, summarise my unread email.",
  },
  {
    kind: "event",
    name: AUTOMATION_KIND_LABEL.event,
    when: "The moment one of your connected apps reports it: a new email, a pull request.",
    example: "When an email from my manager arrives, tell me right away.",
  },
];

// ---------------------------------------------------------------- ready-made requests

export type AutomationTemplate = {
  id: string;
  kind: AutomationKind;
  title: string;
  /** The request, as it is typed into the chat. */
  ask: string;
  /** The app Tex needs connected for it, by slug. */
  app?: string;
  /** Set up on a screen of its own instead of by asking (pull-request review). */
  href?: string;
};

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  { id: "morning-email", kind: "repeat", app: "gmail", title: "Morning email summary", ask: "Every morning at 9, summarise my unread email." },
  { id: "weekly-report", kind: "repeat", title: "Weekly report reminder", ask: "Remind me every Friday at 5pm to send the weekly report." },
  {
    id: "pr-review",
    kind: "event",
    app: "github",
    title: "Review every pull request",
    ask: "When a pull request opens in a repo, review it.",
    href: "/automations/reviews",
  },
  { id: "important-email", kind: "event", app: "gmail", title: "Flag an important email", ask: "When an email from my manager arrives, tell me right away." },
  { id: "one-reminder", kind: "once", title: "A one-time reminder", ask: "Remind me tomorrow at 10am to call the bank." },
  { id: "waiting-prs", kind: "repeat", app: "github", title: "Pull requests waiting on you", ask: "Every weekday at 10am, list the pull requests waiting for my review." },
  { id: "follow-up", kind: "once", app: "gmail", title: "Follow up on an email", ask: "In three days, check whether Maya replied to my last email and tell me." },
  { id: "monthly-invoices", kind: "repeat", title: "Monthly reminder", ask: "On the 1st of every month at 10am, remind me to send invoices." },
];

/** Where a template leads: the chat with its request typed in, or the screen that sets it up. */
export function templateHref(template: AutomationTemplate): string {
  return template.href ?? chatDraftHref(template.ask);
}

/**
 * The templates worth showing. One that needs an app is left out when that app can't be used
 * here (`usable` holds the slugs that are connected or can be connected); while the app list is
 * still loading (`usable` undefined) every template shows.
 */
export function templatesToOffer(templates: readonly AutomationTemplate[], usable: ReadonlySet<string> | undefined): AutomationTemplate[] {
  if (!usable) return [...templates];
  return templates.filter((template) => !template.app || usable.has(template.app));
}

// ---------------------------------------------------------------- when it runs

/** 9, 0 → "9:00 AM"; 18, 30 → "6:30 PM"; 0, 5 → "12:05 AM". */
export function clock12(hour: number, minute: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")} ${hour % 24 < 12 ? "AM" : "PM"}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WHOLE = /^\d+$/;

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 22 → "22nd". */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "1-5" → [1,2,3,4,5]; "1,4" → [1,4]; "6,0" → [6,0]. Null for anything else. */
function weekdays(field: string): number[] | null {
  const days: number[] = [];
  for (const part of field.split(",")) {
    const range = /^(\d)-(\d)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from > to || to > 7) return null;
      for (let day = from; day <= to; day++) days.push(day % 7);
    } else if (/^[0-7]$/.test(part)) {
      days.push(Number(part) % 7);
    } else {
      return null;
    }
  }
  return days;
}

const sameSet = (days: number[], wanted: number[]) => days.length === wanted.length && wanted.every((day) => days.includes(day));

/**
 * A five-field cron line as a sentence: "Every Monday at 9:00 AM", "Every weekday at 8:00 AM",
 * "On the 1st of every month at 10:00 AM", "Every 15 minutes". Null when the line isn't one of
 * the shapes people actually ask for, so the caller can say something honest instead.
 */
export function describeCronInWords(cron: string): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (month !== "*") return null;
  const anyDay = dayOfMonth === "*" && dayOfWeek === "*";

  // No clock time: every so many minutes or hours.
  const everyMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutes && hour === "*" && anyDay) return Number(everyMinutes[1]) === 1 ? "Every minute" : `Every ${everyMinutes[1]} minutes`;
  if (!WHOLE.test(minute) || Number(minute) > 59) return null;
  const everyHours = /^\*\/(\d+)$/.exec(hour);
  if (everyHours && anyDay) return Number(everyHours[1]) === 1 ? "Every hour" : `Every ${everyHours[1]} hours`;
  if (hour === "*" && anyDay) return Number(minute) === 0 ? "Every hour" : `Every hour, at ${Number(minute)} past`;

  const hours = hour.split(",");
  if (!hours.every((h) => WHOLE.test(h) && Number(h) < 24)) return null;
  const at = listNames(hours.map((h) => clock12(Number(h), Number(minute))), "and");

  if (anyDay) return `Every day at ${at}`;
  if (dayOfMonth === "*") {
    const days = weekdays(dayOfWeek);
    if (!days) return null;
    if (sameSet(days, [1, 2, 3, 4, 5])) return `Every weekday at ${at}`;
    if (sameSet(days, [0, 1, 2, 3, 4, 5, 6])) return `Every day at ${at}`;
    return `Every ${listNames(days.map((day) => DAY_NAMES[day]), "and")} at ${at}`;
  }
  if (dayOfWeek === "*" && WHOLE.test(dayOfMonth) && Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 31) {
    return `On the ${ordinal(Number(dayOfMonth))} of every month at ${at}`;
  }
  return null;
}

/** "Asia/Kolkata" → "Kolkata", "America/New_York" → "New York". */
function zoneCity(timezone: string): string {
  return (timezone.split("/").pop() ?? timezone).replace(/_/g, " ");
}

/**
 * Whose clock a schedule follows: "your time" when it is the account's own time zone, the place
 * otherwise ("New York time"). When the account's zone isn't known yet, the place is the safe answer.
 */
export function describeZone(automationZone: string | null | undefined, accountZone: string | null | undefined): string {
  if (!automationZone || automationZone === accountZone) return "your time";
  return `${zoneCity(automationZone)} time`;
}

/** "Tomorrow, 8:00 AM" → "tomorrow, 8:00 AM": a day word in the middle of a sentence. "12 Sep" stays. */
function midSentence(text: string): string {
  return text.replace(/^(Today|Tomorrow|Yesterday)\b/, (word) => word.toLowerCase());
}

// What the trigger names of connected apps mean, most specific first. They are matched against
// the name with the app's own prefix and the closing _TRIGGER / _EVENT taken off.
const TRIGGER_PHRASES: readonly (readonly [RegExp, string])[] = [
  [/PULL_REQUEST|(^|_)PR(_|$)/, "a pull request opens or gets new commits"],
  [/(NEW|RECEIV|INCOMING).*(MAIL|GMAIL_MESSAGE)|MAIL.*(NEW|RECEIV|ARRIV)/, "a new email arrives"],
  [/ISSUE.*(ADD|CREAT|NEW|OPEN)|(NEW|CREAT|OPEN).*ISSUE/, "a new issue is opened"],
  [/COMMIT|PUSH/, "new commits are pushed"],
  [/(NEW|RECEIV|INCOMING).*MESSAGE|MESSAGE.*(NEW|RECEIV|POST)/, "a new message arrives"],
  [/(EVENT|MEETING).*(CREAT|ADD|NEW)|(NEW|CREAT).*(EVENT|MEETING)/, "a new event is added"],
  [/PAGE.*(ADD|CREAT|NEW)|(NEW|CREAT).*PAGE/, "a new page is added"],
  [/FILE.*(ADD|CREAT|NEW|UPLOAD)|(NEW|CREAT).*FILE/, "a new file is added"],
  [/(ROW|RECORD).*(ADD|CREAT|NEW)|(NEW|CREAT).*(ROW|RECORD)/, "a new row is added"],
  [/(CONTACT|LEAD).*(ADD|CREAT|NEW)|(NEW|CREAT).*(CONTACT|LEAD)/, "a new contact is added"],
  [/(TASK|CARD|TICKET).*(ADD|CREAT|NEW)|(NEW|CREAT).*(TASK|CARD|TICKET)/, "a new task is added"],
];

/** GMAIL_NEW_GMAIL_MESSAGE → NEW_GMAIL_MESSAGE; GITHUB_ISSUE_ADDED_EVENT → ISSUE_ADDED. */
function triggerCore(app: string, event: string): string {
  const name = event.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const prefix = `${app.toUpperCase().replace(/[^A-Z0-9]+/g, "")}_`;
  const core = (name.startsWith(prefix) ? name.slice(prefix.length) : name).replace(/_(TRIGGER|EVENT)$/, "");
  return core || name;
}

/**
 * What an app trigger waits for, as a sentence: "When a new email arrives in Gmail". A trigger
 * this file doesn't know keeps the app's own name for it, in quotes, rather than a guess.
 */
export function describeTrigger(trigger: Automation["trigger"]): string {
  const app = trigger?.app;
  if (!app) return "When something happens in one of your apps";
  const name = titleCase(app);
  const event = trigger?.event;
  if (!event) return `When something happens in ${name}`;
  const core = triggerCore(app, event);
  const known = TRIGGER_PHRASES.find(([pattern]) => pattern.test(core));
  return known ? `When ${known[1]} in ${name}` : `When ${name} reports “${humanizeEvent(core)}”`;
}

/** "today at 10:00 AM", "tomorrow at 8:00 AM", "on Thu 15 Oct at 9:00 AM": a moment, to go mid-sentence. */
function dayAndTime(iso: string, now: Date): string {
  const day = formatDay(iso, now);
  const on = /^(Today|Tomorrow|Yesterday)$/.test(day) ? day.toLowerCase() : `on ${day}`;
  return `${on} at ${formatTime(iso)}`;
}

/**
 * When an automation runs, as a sentence someone would say: "Every Monday at 9:00 AM, your time",
 * "Once, tomorrow at 10:00 AM", "When a new email arrives in Gmail". `accountZone` is the
 * person's own time zone (from their profile), so a schedule in it reads "your time".
 */
export function describeAutomationWhen(automation: Automation, accountZone?: string | null, now = new Date()): string {
  // The trigger's own name (GITHUB_PULL_REQUEST_EVENT) says less than this does.
  if (automation.preset === "pr_review") return "When a pull request opens or gets new commits";

  if (automation.kind === "once") return automation.runAt ? `Once, ${dayAndTime(automation.runAt, now)}` : "Once";

  if (automation.kind === "repeat") {
    if (!automation.cron) return "On a schedule";
    const words = describeCronInWords(automation.cron);
    if (!words) return `On a schedule of its own (${automation.cron})`;
    // Only a clock time belongs to a time zone; "every 15 minutes" is the same everywhere.
    return words.includes(" at ") ? `${words}, ${describeZone(automation.timezone, accountZone)}` : words;
  }

  return describeTrigger(automation.trigger);
}

// ---------------------------------------------------------------- how it stands

export type AutomationStatus = { label: string; tone: "done" | "muted" | "danger" };

/** On, or paused and why. */
export function describeAutomationStatus(automation: Pick<Automation, "enabled" | "pausedReason">): AutomationStatus {
  if (automation.enabled) return { label: "On", tone: "done" };
  if (automation.pausedReason === "out_of_credits") return { label: "Paused: out of credits", tone: "danger" };
  if (automation.pausedReason === "failures") return { label: "Paused after failures", tone: "danger" };
  return { label: "Paused", tone: "muted" };
}

/** The next run and the last one, each as a short line. */
export function describeAutomationRuns(automation: Automation, now = new Date()): { next: string; last: string } {
  const review = automation.preset === "pr_review";
  const last = automation.lastRunAt
    ? `${review ? "Last review" : "Last ran"} ${midSentence(formatAgo(automation.lastRunAt, now))}`
    : review
      ? "No review yet"
      : "Hasn’t run yet";

  let next: string;
  if (!automation.enabled) next = "Won’t run while it’s paused";
  else if (review) next = "Runs on each new or updated pull request";
  else if (automation.kind === "event") next = "Runs each time that happens";
  else if (automation.nextRunAt) next = `Next run ${midSentence(formatDateTime(automation.nextRunAt, now))}`;
  else if (automation.kind === "once" && automation.lastRunAt) next = "Done: it ran its one time";
  else next = "Not scheduled yet";

  return { next, last };
}

/**
 * What runs next among the person's automations, in one line for the Automations chat before
 * anything has run there: "Next: Today’s meetings, tomorrow at 8:00 AM". With nothing on a clock,
 * the next is one that waits for something to happen ("Next: Review pull requests in acme/web, when
 * a pull request opens or gets new commits"). Paused ones don't run, so they aren't next.
 */
export function nextRunLine(automations: readonly Automation[], now = new Date()): string {
  const running = automations.filter((automation) => automation.enabled);
  const timed = running
    .filter((automation) => automation.nextRunAt && automation.preset !== "pr_review")
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!));
  const upcoming = timed.find((automation) => Date.parse(automation.nextRunAt!) >= now.getTime()) ?? timed[0];
  if (upcoming) return `Next: ${upcoming.title}, ${dayAndTime(upcoming.nextRunAt!, now)}`;
  const waiting = running.find((automation) => automation.kind === "event") ?? running[0];
  if (waiting) {
    const when = describeAutomationWhen(waiting, null, now);
    return `Next: ${waiting.title}, ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
  }
  return automations.length === 1 ? "Your automation is paused: nothing runs until you resume it." : "Your automations are paused: nothing runs until you resume one.";
}

/** What an automation costs, in a few words for its row. The rates are in `AUTOMATION_CREDITS`. */
export function describeAutomationCost(automation: Pick<Automation, "kind" | "preset">): string {
  if (automation.preset === "pr_review") return "Each review uses credits";
  return automation.kind === "once" ? "Uses credits once, when it runs" : "Uses credits each time it runs";
}

/** What a run costs, said once for the whole list. The numbers are the ones in credit-costs.ts. */
export const AUTOMATION_CREDITS =
  "A run costs what the same request in chat would: 1 credit per 10 minutes of running time, and 1 credit for each app action that changes something. Reading and searching are free.";

// ---------------------------------------------------------------- the card and the overview

/**
 * The next run and the last one, as the values under "Next run" and "Last run" on an automation's
 * card: "Tomorrow, 8:00 AM", "Each time it happens", "2h ago", "Not yet". `ran` says whether there
 * is a result to look at in the Automations chat.
 */
export function describeAutomationTimes(automation: Automation, now = new Date()): { next: string; last: string; ran: boolean } {
  const review = automation.preset === "pr_review";
  let next: string;
  if (!automation.enabled) next = "Not while it’s paused";
  else if (review) next = "On each new or updated pull request";
  else if (automation.kind === "event") next = "Each time it happens";
  else if (automation.nextRunAt) next = formatDateTime(automation.nextRunAt, now);
  else if (automation.kind === "once" && automation.lastRunAt) next = "None: it ran its one time";
  else next = "Not scheduled yet";

  const ago = automation.lastRunAt ? formatAgo(automation.lastRunAt, now) : null;
  const last = ago ? ago.charAt(0).toUpperCase() + ago.slice(1) : "Not yet";
  return { next, last, ran: Boolean(automation.lastRunAt) };
}

/** How the person's automations stand, for the overview above the list. */
export function summarizeAutomations(automations: readonly Pick<Automation, "enabled" | "pausedReason">[]): {
  on: number;
  paused: number;
  /** Paused by the system (out of credits, after failures): these wait for the person. */
  needYou: number;
} {
  const on = automations.filter((automation) => automation.enabled).length;
  const needYou = automations.filter(
    (automation) => !automation.enabled && (automation.pausedReason === "failures" || automation.pausedReason === "out_of_credits"),
  ).length;
  return { on, paused: automations.length - on, needYou };
}

/**
 * The request that opens the chat to change an automation. The API can only pause, resume and
 * delete one, so a change is asked of Tex, who knows the automation by its title.
 */
export function changeRequest(automation: Pick<Automation, "title">): string {
  return `Change my automation “${automation.title}”: `;
}
