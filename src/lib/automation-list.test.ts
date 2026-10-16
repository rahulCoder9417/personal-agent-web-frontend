import { describe, expect, it } from "vitest";
import type { Automation, AutomationRun } from "./api/client";
import type { AppLink } from "./automation-apps";
import {
  inFilter,
  lastRunStatus,
  listHeadline,
  logoStack,
  matchesSearch,
  needsYou,
  nextRunText,
  rowApps,
  rowLine,
  rowRepo,
  rowTitle,
  stackLabel,
} from "./automation-list";

const NOW = new Date("2026-10-01T14:30:00");

const base: Automation = {
  id: "aut_1",
  kind: "repeat",
  title: "Morning email summary",
  instruction: "Sum up my unread email in a few lines.",
  steps: [],
  runAt: null,
  cron: "0 9 * * *",
  timezone: "Asia/Kolkata",
  trigger: null,
  copyTo: null,
  apps: ["gmail"],
  askFirst: "risky",
  preset: null,
  enabled: true,
  pausedReason: null,
  nextRunAt: "2026-10-02T09:00:00",
  lastRunAt: "2026-10-01T09:00:00",
  createdAt: "2026-09-01T09:00:00",
};

const step = (over: Partial<NonNullable<Automation["steps"]>[number]>): NonNullable<Automation["steps"]>[number] => ({
  id: "s",
  type: "action",
  title: "A step",
  app: "gmail",
  action: "GMAIL_FETCH_EMAILS",
  inputs: {},
  instruction: null,
  readApps: [],
  askFirst: false,
  onlyIf: { kind: "always" },
  showResult: false,
  risky: false,
  ...over,
});

describe("the stack of logos", () => {
  it("shows each mark once and in order, up to three", () => {
    expect(logoStack(["schedule", "gmail", "tex"])).toEqual({ shown: ["schedule", "gmail", "tex"], more: 0, all: ["schedule", "gmail", "tex"] });
    expect(logoStack(["gmail", "tex", "Gmail"])).toEqual({ shown: ["gmail", "tex"], more: 0, all: ["gmail", "tex"] });
    expect(logoStack([])).toEqual({ shown: [], more: 0, all: [] });
  });

  it("with more than three, the first two and a +N tile, never wider than three", () => {
    const stack = logoStack(["schedule", "github", "linear", "tex", "gmail", "googlesheets", "linear"]);
    expect(stack.shown).toEqual(["schedule", "github"]);
    expect(stack.more).toBe(4);
    expect(stack.all).toEqual(["schedule", "github", "linear", "tex", "gmail", "googlesheets"]);
    expect(stack.shown.length + (stack.more ? 1 : 0)).toBeLessThanOrEqual(3);
    expect(logoStack(["a", "b", "c", "d"]).more).toBe(2);
  });

  it("names every mark for a tooltip and a screen reader, the catalog's names first", () => {
    const stack = logoStack(["schedule", "github", "linear", "tex"]);
    expect(stackLabel(stack, new Map([["linear", "Linear"]]))).toEqual({ label: "Uses Schedule, GitHub, Linear and Tex", title: "Schedule · GitHub · Linear · Tex" });
  });

  it("is the trigger, then each step's app in order, then Tex; review is GitHub and Patch", () => {
    expect(rowApps(base)).toEqual(["schedule", "gmail", "tex"]);
    expect(rowApps({ ...base, kind: "once" })).toEqual(["once", "gmail", "tex"]);
    expect(rowApps({ ...base, kind: "event", trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: {} }, apps: [] })).toEqual(["gmail", "tex"]);
    const steps = [step({ id: "a" }), step({ id: "b", type: "tex", app: null, action: null, readApps: ["googlecalendar"] }), step({ id: "c", app: "notion" })];
    expect(rowApps({ ...base, steps })).toEqual(["schedule", "gmail", "googlecalendar", "tex", "notion"]);
    expect(rowApps({ ...base, kind: "event", preset: "pr_review" })).toEqual(["github", "patch"]);
  });
});

describe("a row's words", () => {
  it("says when it runs and what it does", () => {
    expect(rowLine(base, "Asia/Kolkata", NOW)).toBe("Every day at 9:00 AM · Sum up my unread email in a few lines.");
    const steps = [step({ id: "a" }), step({ id: "b", type: "tex", app: null, action: null }), step({ id: "c", app: "github" })];
    expect(rowLine({ ...base, steps }, "Asia/Kolkata", NOW)).toBe("Every day at 9:00 AM · 3 steps with Gmail and GitHub");
    const many = ["gmail", "github", "linear"].map((app, i) => step({ id: `s${i}`, app }));
    expect(rowLine({ ...base, steps: many }, "Asia/Kolkata", NOW)).toBe("Every day at 9:00 AM · 3 steps across 3 apps");
    // Another time zone keeps its place's name.
    expect(rowLine(base, "Europe/London", NOW)).toContain("Kolkata time");
  });

  it("names a pull-request review, with its repo apart", () => {
    const review = { ...base, kind: "event" as const, preset: "pr_review" as const, title: "Review pull requests in acme/web", trigger: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT", config: { owner: "acme", repo: "web" } } };
    expect(rowTitle(review)).toBe("Review pull requests");
    expect(rowRepo(review)).toBe("acme/web");
    expect(rowLine(review, null, NOW)).toBe("When a pull request opens · Patch comments on it");
    expect(nextRunText(review, NOW)).toBe("On the next pull request");
  });
});

describe("the last run", () => {
  const run = (over: Partial<AutomationRun>): AutomationRun => ({
    id: "run_1",
    automationId: "aut_1",
    state: "done",
    test: false,
    currentStepId: null,
    stopReason: null,
    steps: [],
    resultsRemoved: false,
    startedAt: "2026-10-01T12:30:00",
    endedAt: null,
    ...over,
  });

  it("is green when it ran, amber while a step waits for an OK (with the approval), red when it failed", () => {
    expect(lastRunStatus(base, run({}), NOW)).toEqual({ tone: "ok", text: "2h ago" });
    expect(
      lastRunStatus(base, run({ state: "waiting", steps: [{ stepId: "a", number: 1, title: "Send", state: "waiting", result: null, reason: null, tries: 0, approvalId: "apr_9" }] }), NOW),
    ).toEqual({ tone: "warn", text: "Waiting for your OK", approvalId: "apr_9" });
    expect(lastRunStatus(base, run({ state: "failed" }), NOW)).toEqual({ tone: "danger", text: "2h ago · failed" });
    expect(lastRunStatus(base, run({ state: "stopped", stopReason: "nothing urgent" }), NOW)).toEqual({ tone: "muted", text: "2h ago · nothing urgent" });
  });

  it("without runs, from the automation: not yet, ran, or failed (paused after failures)", () => {
    expect(lastRunStatus({ ...base, lastRunAt: null }, null, NOW)).toEqual({ tone: "muted", text: "Not yet" });
    expect(lastRunStatus(base, null, NOW).tone).toBe("ok");
    expect(lastRunStatus({ ...base, enabled: false, pausedReason: "failures" }, null, NOW)).toEqual({ tone: "danger", text: "5h ago · failed" });
  });

  it("says Paused for the next run of a paused one", () => {
    expect(nextRunText({ ...base, enabled: false }, NOW)).toBe("Paused");
  });
});

describe("what needs the person", () => {
  const app = (health: AppLink["health"]): AppLink => ({ slug: "notion", name: "Notion", health, app: null });

  it("an app to connect or reconnect comes first, then a pause the system made, then a waiting OK", () => {
    expect(needsYou(base, [app("connect")])?.label).toBe("Connect Notion");
    expect(needsYou(base, [app("reconnect")])?.label).toBe("Reconnect Notion");
    expect(needsYou(base, [app("plan")])?.label).toBe("Notion isn’t on your plan");
    expect(needsYou({ ...base, enabled: false, pausedReason: "out_of_credits" }, [])?.label).toBe("Out of credits");
    expect(needsYou({ ...base, enabled: false, pausedReason: "failures" }, [])?.label).toBe("Paused after failures");
    expect(needsYou(base, [], true)?.label).toBe("Waiting for your OK");
    expect(needsYou(base, [])).toBeNull();
    // Paused by the person needs nothing.
    expect(needsYou({ ...base, enabled: false, pausedReason: "user" }, [])).toBeNull();
  });
});

describe("filters and search", () => {
  it("splits on a clock (once or a schedule) and when something happens", () => {
    expect(inFilter(base, "schedule", false)).toBe(true);
    expect(inFilter({ ...base, kind: "once" }, "schedule", false)).toBe(true);
    expect(inFilter({ ...base, kind: "event" }, "event", false)).toBe(true);
    expect(inFilter(base, "event", false)).toBe(false);
    expect(inFilter(base, "needs", true)).toBe(true);
    expect(inFilter(base, "needs", false)).toBe(false);
    expect(inFilter(base, "all", false)).toBe(true);
  });

  it("finds a row by every word typed, in its name, repo, instruction or apps", () => {
    expect(matchesSearch(base, "morning email")).toBe(true);
    expect(matchesSearch(base, "MORNING unread")).toBe(true);
    expect(matchesSearch(base, "morning slack")).toBe(false);
    expect(matchesSearch(base, "gmail", ["Gmail"])).toBe(true);
    expect(matchesSearch({ ...base, preset: "pr_review", trigger: { app: "github", event: "E", config: { owner: "acme", repo: "web" } } }, "acme/web")).toBe(true);
    expect(matchesSearch(base, "  ")).toBe(true);
  });
});

describe("the line under the title", () => {
  it("counts the running and the paused, and the plan's room", () => {
    const list = [base, base, { ...base, enabled: false }];
    expect(listHeadline(list, { planName: "Max", limit: 50 })).toBe("2 running · 1 paused · 3 of 50 on your Max plan");
    expect(listHeadline([base], null)).toBe("1 running");
    expect(listHeadline([], { planName: "Pro", limit: 5 })).toBe("None yet · 0 of 5 on your Pro plan");
    // A reminder that has run is neither.
    expect(listHeadline([{ ...base, kind: "once", nextRunAt: null }], null)).toBe("0 running");
  });
});
