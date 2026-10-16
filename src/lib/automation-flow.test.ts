import { describe, expect, it } from "vitest";
import type { Automation } from "./api/client";
import {
  ASKS_FIRST,
  automationFlow,
  automationHref,
  FLOW_STEP_IDS,
  flowApps,
  flowStatus,
  flowStep,
  INSTRUCTION_NOTE,
  NO_APPS,
  REVIEW_ASKS,
  reviewedRepo,
  triggerSettings,
} from "./automation-flow";

// Every automation draws as the same five steps (docs/automations-flow-proposal.md, section 3).
// Local times, like the other date tests, so the answers don't depend on where the tests run.
const NOW = new Date("2026-10-01T14:30:00");
const base: Automation = {
  id: "aut_1",
  kind: "repeat",
  title: "Monday PRs",
  instruction: "List my open pull requests in acme/web",
  cron: "0 9 * * 1",
  timezone: "Asia/Kolkata",
  enabled: true,
  pausedReason: null,
  nextRunAt: "2026-10-05T09:00:00",
  lastRunAt: null,
  createdAt: "2026-09-01T00:00:00Z",
  copyTo: null,
};

const step = (automation: Automation, id: (typeof FLOW_STEP_IDS)[number]) => flowStep(automationFlow(automation, "Asia/Kolkata", NOW), id);
const detail = (automation: Automation, id: (typeof FLOW_STEP_IDS)[number], label: string) =>
  step(automation, id).details.find((line) => line.label === label)?.value;

describe("automationFlow", () => {
  it("is the five steps, in order, for every kind", () => {
    for (const automation of [
      base,
      { ...base, kind: "once" as const, cron: null, runAt: "2026-10-02T10:00:00", nextRunAt: "2026-10-02T10:00:00" },
      { ...base, kind: "event" as const, cron: null, trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: {} } },
    ]) {
      const steps = automationFlow(automation, "Asia/Kolkata", NOW);
      expect(steps.map((s) => s.id)).toEqual(["trigger", "instruction", "apps", "asks", "results"]);
      expect(steps.map((s) => s.label)).toEqual(["Trigger", "Tex’s instruction", "Apps Tex may use", "Asks you first", "Results"]);
    }
  });

  it("says when it runs in words, in the person's own time", () => {
    expect(step(base, "trigger").title).toBe("Every Monday at 9:00 AM, your time");
    const once = { ...base, kind: "once" as const, cron: null, runAt: "2026-10-02T10:00:00" };
    expect(step(once, "trigger").title).toBe("Once, tomorrow at 10:00 AM");
    const event = { ...base, kind: "event" as const, cron: null, trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: {} } };
    expect(step(event, "trigger").title).toBe("When a new email arrives in Gmail");
    expect(detail(event, "trigger", "Event")).toBe("GMAIL_NEW_GMAIL_MESSAGE");
    expect(detail(base, "trigger", "Time zone")).toBe("Asia/Kolkata");
    expect(detail(base, "trigger", "Next run")).toBe("Mon 5 Oct, 9:00 AM");
  });

  it("shows the trigger's settings", () => {
    const event = {
      ...base,
      kind: "event" as const,
      cron: null,
      trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: { from: "boss@acme.com", labelIds: ["INBOX", "IMPORTANT"] } },
    };
    const trigger = step(event, "trigger");
    expect(trigger.lines).toContain("From: boss@acme.com");
    expect(trigger.lines).toContain("Label ids: INBOX, IMPORTANT");
    expect(detail(event, "trigger", "From")).toBe("boss@acme.com");
    // An older backend sends no settings: none are shown.
    const older = { ...event, trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE" } };
    expect(step(older, "trigger").lines).toEqual(["On"]);
  });

  it("marks the trigger paused, and paused by the system as needing you", () => {
    expect(step(base, "trigger").tone).toBe("default");
    const byYou = { ...base, enabled: false, pausedReason: "user" as const };
    expect(step(byYou, "trigger").tone).toBe("paused");
    expect(step(byYou, "trigger").lines).toContain("Paused");
    expect(detail(byYou, "trigger", "Next run")).toBe("Not while it’s paused");
    for (const reason of ["out_of_credits", "failures"] as const) {
      expect(step({ ...base, enabled: false, pausedReason: reason }, "trigger").tone).toBe("danger");
    }
    expect(step({ ...base, enabled: false, pausedReason: "out_of_credits" }, "trigger").lines).toContain("Paused: out of credits");
  });

  it("gives Tex's instruction with its title, and says Tex follows it in its own way", () => {
    const instruction = step(base, "instruction");
    expect(instruction.title).toBe("Monday PRs");
    expect(instruction.lines).toEqual(["List my open pull requests in acme/web"]);
    expect(instruction.note).toBe(INSTRUCTION_NOTE);
  });

  it("names the apps: the trigger's, then Tex's, each once; none reads as the connected apps", () => {
    expect(step(base, "apps").title).toBe(NO_APPS);
    expect(step(base, "apps").apps).toEqual([]);
    const event = { ...base, kind: "event" as const, cron: null, trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: {} } };
    expect(step(event, "apps").title).toBe("Gmail");
    expect(flowApps({ ...event, apps: ["gmail", "slack", "github"] })).toEqual(["gmail", "slack", "github"]);
    expect(flowApps({ ...base, apps: ["googlecalendar"] })).toEqual(["googlecalendar"]);
    expect(automationFlow({ ...event, apps: ["slack"] }, null, NOW)[2].title).toBe("Gmail and Slack");
  });

  it("has the platform's rule for risky actions, and the Automations chat with a copy where it was made", () => {
    expect(step(base, "asks").title).toBe(ASKS_FIRST);
    expect(step(base, "results").title).toBe("Automations chat");
    expect(step(base, "results").lines).toEqual([]);
    expect(step({ ...base, copyTo: "telegram" }, "results").lines).toEqual(["Copy to Telegram"]);
    expect(detail({ ...base, copyTo: "telegram" }, "results", "A copy")).toContain("Telegram");
    // An older backend sends no copyTo: no copy is claimed.
    const older: Automation = { ...base };
    delete older.copyTo;
    expect(step(older, "results").lines).toEqual([]);
  });

  it("draws pull-request review as the platform runs it", () => {
    const review: Automation = {
      ...base,
      kind: "event",
      cron: null,
      preset: "pr_review",
      title: "Review pull requests in acme/web",
      trigger: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT", config: { owner: "acme", repo: "web" } },
      copyTo: "telegram",
    };
    const steps = automationFlow(review, "Asia/Kolkata", NOW);
    expect(steps.map((s) => s.title)).toEqual([
      "A pull request opens or gets new commits in acme/web",
      "Patch reviews it",
      "GitHub",
      REVIEW_ASKS,
      "Automations chat",
    ]);
    expect(steps[0].lines).toEqual(["On"]);
    expect(steps[4].lines).toEqual(["Copy to Telegram"]);
    expect(reviewedRepo(review)).toBe("acme/web");
    // Without its settings it still reads right.
    expect(automationFlow({ ...review, trigger: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT" } }, null, NOW)[0].title).toBe(
      "A pull request opens or gets new commits",
    );
  });

  it("reads a draft as not saved yet", () => {
    const draft = { ...base, enabled: undefined, pausedReason: undefined };
    expect(flowStatus(draft)).toEqual({ label: "Not saved yet", tone: "muted" });
    const trigger = automationFlow(draft, "Asia/Kolkata", NOW)[0];
    expect(trigger.lines).toEqual(["Not saved yet"]);
    expect(trigger.tone).toBe("default");
    expect(trigger.details.find((line) => line.label === "Status")?.value).toMatch(/nothing runs until you save it/);
  });
});

describe("triggerSettings", () => {
  it("puts an owner and a repo together, and names each other setting", () => {
    expect(triggerSettings({ owner: "acme", repo: "web", events: ["opened"] })).toEqual([
      { label: "Repository", value: "acme/web" },
      { label: "Events", value: "opened" },
    ]);
    expect(triggerSettings({ query: "from:boss@acme.com", nested: { a: 1 }, empty: "" })).toEqual([
      { label: "Query", value: "from:boss@acme.com" },
      { label: "Nested", value: '{"a":1}' },
      { label: "Empty", value: "none" },
    ]);
    expect(triggerSettings(undefined)).toEqual([]);
    expect(triggerSettings({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 })).toHaveLength(6);
  });
});

describe("automationHref", () => {
  it("is the automation's own page", () => {
    expect(automationHref("aut_1")).toBe("/automations/aut_1");
  });
});

describe("the strip's short words", () => {
  it("are a word or two per step", () => {
    const shorts = (automation: Automation) => automationFlow(automation, null, NOW).map((s) => s.short);
    expect(shorts(base)).toEqual(["Schedule", "Tex", "Your apps", "Asks first", "Automations chat"]);
    expect(shorts({ ...base, kind: "once", cron: null, runAt: "2026-10-02T10:00:00", copyTo: "telegram" })).toEqual([
      "Once",
      "Tex",
      "Your apps",
      "Asks first",
      "Chat + Telegram",
    ]);
    const event: Automation = { ...base, kind: "event", cron: null, trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE" } };
    expect(shorts(event)[0]).toBe("Gmail event");
    expect(automationFlow({ ...event, apps: ["slack", "notion"] }, null, NOW)[2].short).toBe("3 apps");
    expect(automationFlow({ ...event, preset: "pr_review" }, null, NOW).map((s) => s.short)).toEqual([
      "New pull request",
      "Patch reviews",
      "GitHub",
      "Comments only",
      "Automations chat",
    ]);
  });
});
