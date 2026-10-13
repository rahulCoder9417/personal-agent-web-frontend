import { describe, expect, it } from "vitest";
import type { Automation } from "./api/client";
import {
  AUTOMATION_KINDS,
  AUTOMATION_TEMPLATES,
  clock12,
  describeAutomationCost,
  describeAutomationRuns,
  describeAutomationStatus,
  describeAutomationWhen,
  describeCronInWords,
  describeTrigger,
  describeZone,
  nextRunLine,
  templateHref,
  templatesToOffer,
} from "./automations";
import { formatTime } from "./format";

// Local times (no zone), like the other date tests, so the answers don't depend on where the tests run.
const NOW = new Date("2026-10-01T14:30:00");

const base: Automation = { id: "a1", kind: "repeat", title: "t", instruction: "i", enabled: true, createdAt: "2026-09-01T00:00:00Z" };
const repeat = (cron: string, timezone: string | null = "Asia/Kolkata"): Automation => ({ ...base, cron, timezone });
const event = (app: string, name: string): Automation => ({ ...base, kind: "event", trigger: { app, event: name } });

describe("clock12", () => {
  it("writes the hour the way people say it", () => {
    expect(clock12(9, 0)).toBe("9:00 AM");
    expect(clock12(18, 30)).toBe("6:30 PM");
    expect(clock12(0, 5)).toBe("12:05 AM");
    expect(clock12(12, 0)).toBe("12:00 PM");
  });
});

describe("describeCronInWords", () => {
  it("names the day and the time", () => {
    expect(describeCronInWords("0 9 * * 1")).toBe("Every Monday at 9:00 AM");
    expect(describeCronInWords("0 8 * * 1-5")).toBe("Every weekday at 8:00 AM");
    expect(describeCronInWords("30 18 * * *")).toBe("Every day at 6:30 PM");
    expect(describeCronInWords("0 17 * * 5")).toBe("Every Friday at 5:00 PM");
    expect(describeCronInWords("0 10 * * 1,4")).toBe("Every Monday and Thursday at 10:00 AM");
    expect(describeCronInWords("0 9 * * 6,0")).toBe("Every Saturday and Sunday at 9:00 AM");
    expect(describeCronInWords("0 9 * * 1,3,5")).toBe("Every Monday, Wednesday and Friday at 9:00 AM");
    expect(describeCronInWords("0 7 * * 0-6")).toBe("Every day at 7:00 AM");
    expect(describeCronInWords("0 7 * * 7")).toBe("Every Sunday at 7:00 AM");
  });

  it("names a day of the month, and more than one time a day", () => {
    expect(describeCronInWords("0 10 1 * *")).toBe("On the 1st of every month at 10:00 AM");
    expect(describeCronInWords("0 9 22 * *")).toBe("On the 22nd of every month at 9:00 AM");
    expect(describeCronInWords("0 9 13 * *")).toBe("On the 13th of every month at 9:00 AM");
    expect(describeCronInWords("0 9,17 * * *")).toBe("Every day at 9:00 AM and 5:00 PM");
  });

  it("says how often when there is no clock time", () => {
    expect(describeCronInWords("*/15 * * * *")).toBe("Every 15 minutes");
    expect(describeCronInWords("0 */2 * * *")).toBe("Every 2 hours");
    expect(describeCronInWords("0 * * * *")).toBe("Every hour");
    expect(describeCronInWords("30 * * * *")).toBe("Every hour, at 30 past");
  });

  it("gives up on anything else rather than guess", () => {
    expect(describeCronInWords("0 9 1 1 *")).toBeNull();
    expect(describeCronInWords("0 9 1 * 1")).toBeNull();
    expect(describeCronInWords("0 9 * * MON")).toBeNull();
    expect(describeCronInWords("61 9 * * *")).toBeNull();
    expect(describeCronInWords("not a cron")).toBeNull();
  });
});

describe("describeZone", () => {
  it("is your time in your own time zone, and a place otherwise", () => {
    expect(describeZone("Asia/Kolkata", "Asia/Kolkata")).toBe("your time");
    expect(describeZone(null, "Asia/Kolkata")).toBe("your time");
    expect(describeZone("America/New_York", "Asia/Kolkata")).toBe("New York time");
    // The account's zone hasn't loaded yet: name the place rather than claim it is yours.
    expect(describeZone("Asia/Kolkata", undefined)).toBe("Kolkata time");
  });
});

describe("describeTrigger", () => {
  it("says what the app is waited on for", () => {
    expect(describeTrigger({ app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE" })).toBe("When a new email arrives in Gmail");
    expect(describeTrigger({ app: "gmail", event: "NEW_EMAIL" })).toBe("When a new email arrives in Gmail");
    expect(describeTrigger({ app: "github", event: "GITHUB_PULL_REQUEST_EVENT" })).toBe("When a pull request opens or gets new commits in GitHub");
    expect(describeTrigger({ app: "github", event: "GITHUB_ISSUE_ADDED_EVENT" })).toBe("When a new issue is opened in GitHub");
    expect(describeTrigger({ app: "github", event: "GITHUB_COMMIT_EVENT" })).toBe("When new commits are pushed in GitHub");
    expect(describeTrigger({ app: "slack", event: "SLACK_RECEIVE_MESSAGE" })).toBe("When a new message arrives in Slack");
    expect(describeTrigger({ app: "googlecalendar", event: "GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_CREATED_TRIGGER" })).toBe(
      "When a new event is added in Google Calendar",
    );
    expect(describeTrigger({ app: "notion", event: "NOTION_PAGE_ADDED_TRIGGER" })).toBe("When a new page is added in Notion");
  });

  it("keeps the app's own name for a trigger it doesn't know, without the app's prefix", () => {
    expect(describeTrigger({ app: "hubspot", event: "HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER" })).toBe("When HubSpot reports “deal stage updated”");
  });

  it("still makes a sentence with half the facts", () => {
    expect(describeTrigger({ app: "gmail" })).toBe("When something happens in Gmail");
    expect(describeTrigger(null)).toBe("When something happens in one of your apps");
    expect(describeTrigger({})).toBe("When something happens in one of your apps");
  });
});

describe("describeAutomationWhen", () => {
  it("says a schedule the way someone would, in whose time", () => {
    expect(describeAutomationWhen(repeat("0 9 * * 1"), "Asia/Kolkata", NOW)).toBe("Every Monday at 9:00 AM, your time");
    expect(describeAutomationWhen(repeat("0 8 * * 1-5", "Europe/London"), "Asia/Kolkata", NOW)).toBe("Every weekday at 8:00 AM, London time");
    expect(describeAutomationWhen(repeat("0 8 * * *", null), "Asia/Kolkata", NOW)).toBe("Every day at 8:00 AM, your time");
  });

  it("leaves the time zone off a schedule that has no clock time", () => {
    expect(describeAutomationWhen(repeat("*/15 * * * *"), "Asia/Kolkata", NOW)).toBe("Every 15 minutes");
  });

  it("is honest about a schedule it can't put into words", () => {
    expect(describeAutomationWhen(repeat("0 9 1 1 *"), "Asia/Kolkata", NOW)).toBe("On a schedule of its own (0 9 1 1 *)");
    expect(describeAutomationWhen({ ...base, cron: null }, "Asia/Kolkata", NOW)).toBe("On a schedule");
  });

  it("says when a one-time automation runs", () => {
    const tomorrow = "2026-10-02T10:00:00";
    const later = "2026-10-09T17:00:00";
    expect(describeAutomationWhen({ ...base, kind: "once", runAt: tomorrow }, null, NOW)).toBe(`Once, tomorrow at ${formatTime(tomorrow)}`);
    expect(describeAutomationWhen({ ...base, kind: "once", runAt: later }, null, NOW)).toBe(`Once, on Fri 9 Oct at ${formatTime(later)}`);
    expect(describeAutomationWhen({ ...base, kind: "once" }, null, NOW)).toBe("Once");
  });

  it("puts a trigger into words, and pull-request review into its own", () => {
    expect(describeAutomationWhen(event("gmail", "GMAIL_NEW_GMAIL_MESSAGE"), null, NOW)).toBe("When a new email arrives in Gmail");
    const review: Automation = { ...event("github", "GITHUB_PULL_REQUEST_EVENT"), preset: "pr_review" };
    expect(describeAutomationWhen(review, null, NOW)).toBe("When a pull request opens or gets new commits");
  });
});

describe("describeAutomationStatus", () => {
  it("is on, or paused and why", () => {
    expect(describeAutomationStatus({ enabled: true, pausedReason: null })).toEqual({ label: "On", tone: "done" });
    expect(describeAutomationStatus({ enabled: false, pausedReason: "user" })).toEqual({ label: "Paused", tone: "muted" });
    expect(describeAutomationStatus({ enabled: false, pausedReason: null })).toEqual({ label: "Paused", tone: "muted" });
    expect(describeAutomationStatus({ enabled: false, pausedReason: "out_of_credits" })).toEqual({ label: "Paused: out of credits", tone: "danger" });
    expect(describeAutomationStatus({ enabled: false, pausedReason: "failures" })).toEqual({ label: "Paused after failures", tone: "danger" });
  });
});

describe("describeAutomationRuns", () => {
  it("gives the next run and the last one", () => {
    const next = "2026-10-02T08:00:00";
    const runs = describeAutomationRuns({ ...repeat("0 8 * * *"), nextRunAt: next, lastRunAt: "2026-10-01T08:00:00" }, NOW);
    expect(runs.next).toBe(`Next run tomorrow, ${formatTime(next)}`);
    expect(runs.last).toBe("Last ran 6h ago");
  });

  it("says so when it has never run or isn't scheduled", () => {
    expect(describeAutomationRuns(repeat("0 8 * * *"), NOW)).toEqual({ next: "Not scheduled yet", last: "Hasn’t run yet" });
  });

  it("doesn't promise a run while paused", () => {
    const paused = { ...repeat("0 8 * * *"), enabled: false, nextRunAt: "2026-10-02T08:00:00", lastRunAt: "2026-09-30T08:00:00" };
    expect(describeAutomationRuns(paused, NOW)).toEqual({ next: "Won’t run while it’s paused", last: "Last ran yesterday" });
  });

  it("has no clock time for a trigger, and its own words for pull-request review", () => {
    expect(describeAutomationRuns(event("gmail", "NEW_EMAIL"), NOW).next).toBe("Runs each time that happens");
    const review: Automation = { ...event("github", "GITHUB_PULL_REQUEST_EVENT"), preset: "pr_review" };
    expect(describeAutomationRuns(review, NOW)).toEqual({ next: "Runs on each new or updated pull request", last: "No review yet" });
    expect(describeAutomationRuns({ ...review, lastRunAt: "2026-10-01T14:05:00" }, NOW).last).toBe("Last review 25 min ago");
  });

  it("says a one-time automation is done once it has run", () => {
    const done: Automation = { ...base, kind: "once", runAt: "2026-09-30T10:00:00", lastRunAt: "2026-09-30T10:00:00", nextRunAt: null };
    expect(describeAutomationRuns(done, NOW).next).toBe("Done: it ran its one time");
  });
});

describe("nextRunLine", () => {
  const at = (iso: string, title: string, rest: Partial<Automation> = {}): Automation => ({ ...repeat("0 8 * * 1-5"), id: title, title, nextRunAt: iso, ...rest });

  it("names the automation that runs next and when", () => {
    const meetings = at("2026-10-02T08:00:00", "Today’s meetings");
    const invoice = at("2026-10-01T16:00:00", "Chase the invoice", { kind: "once", runAt: "2026-10-01T16:00:00" });
    const later = at("2026-10-08T09:00:00", "Weekly review");
    expect(nextRunLine([meetings, later, invoice], NOW)).toBe(`Next: Chase the invoice, today at ${formatTime("2026-10-01T16:00:00")}`);
    expect(nextRunLine([meetings, later], NOW)).toBe(`Next: Today’s meetings, tomorrow at ${formatTime("2026-10-02T08:00:00")}`);
    expect(nextRunLine([later], NOW)).toBe(`Next: Weekly review, on Thu 8 Oct at ${formatTime("2026-10-08T09:00:00")}`);
    // A paused one doesn't run; one whose time has passed is next only when nothing is still to come.
    expect(nextRunLine([{ ...invoice, enabled: false }, meetings], NOW)).toMatch(/^Next: Today’s meetings/);
    expect(nextRunLine([at("2026-10-01T09:00:00", "Missed")], NOW)).toMatch(/^Next: Missed, today at/);
  });

  it("says when one that waits for something happening runs, and when all are paused", () => {
    expect(nextRunLine([event("gmail", "GMAIL_NEW_GMAIL_MESSAGE")], NOW)).toMatch(/^Next: t, when a new email arrives in Gmail/);
    const review: Automation = { ...event("github", "GITHUB_PULL_REQUEST_EVENT"), title: "Review pull requests in acme/web", preset: "pr_review" };
    expect(nextRunLine([review], NOW)).toBe("Next: Review pull requests in acme/web, when a pull request opens or gets new commits");
    expect(nextRunLine([{ ...review, enabled: false }], NOW)).toBe("Your automation is paused: nothing runs until you resume it.");
    expect(nextRunLine([{ ...review, enabled: false }, { ...base, enabled: false }], NOW)).toBe("Your automations are paused: nothing runs until you resume one.");
  });
});

describe("describeAutomationCost", () => {
  it("says when credits are used", () => {
    expect(describeAutomationCost({ kind: "once" })).toBe("Uses credits once, when it runs");
    expect(describeAutomationCost({ kind: "repeat" })).toBe("Uses credits each time it runs");
    expect(describeAutomationCost({ kind: "event" })).toBe("Uses credits each time it runs");
    expect(describeAutomationCost({ kind: "event", preset: "pr_review" })).toBe("Each review uses credits");
  });
});

describe("the guide and the templates", () => {
  it("explains the three kinds, each with a request that makes one", () => {
    expect(AUTOMATION_KINDS.map((guide) => guide.kind)).toEqual(["once", "repeat", "event"]);
    for (const guide of AUTOMATION_KINDS) {
      expect(guide.name).not.toBe("");
      expect(guide.when).not.toBe("");
      expect(guide.example).not.toBe("");
    }
  });

  it("has a template of every kind, with ids that don't repeat", () => {
    const ids = AUTOMATION_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(AUTOMATION_TEMPLATES.map((template) => template.kind))).toEqual(new Set(["once", "repeat", "event"]));
  });

  it("opens the chat with the request typed in, and sends pull-request review to its own screen", () => {
    const email = AUTOMATION_TEMPLATES.find((template) => template.id === "morning-email");
    expect(email && templateHref(email)).toBe("/?draft=Every%20morning%20at%209%2C%20summarise%20my%20unread%20email.");
    const review = AUTOMATION_TEMPLATES.find((template) => template.id === "pr-review");
    expect(review && templateHref(review)).toBe("/automations/reviews");
  });

  it("leaves out a template whose app can't be used here, and shows them all while the apps load", () => {
    expect(templatesToOffer(AUTOMATION_TEMPLATES, undefined)).toHaveLength(AUTOMATION_TEMPLATES.length);
    const gmailOnly = templatesToOffer(AUTOMATION_TEMPLATES, new Set(["gmail"]));
    expect(gmailOnly.some((template) => template.app === "github")).toBe(false);
    expect(gmailOnly.some((template) => template.app === "gmail")).toBe(true);
    // The ones that need no app are always there.
    expect(templatesToOffer(AUTOMATION_TEMPLATES, new Set()).every((template) => !template.app)).toBe(true);
    expect(templatesToOffer(AUTOMATION_TEMPLATES, new Set()).length).toBeGreaterThan(0);
  });
});
