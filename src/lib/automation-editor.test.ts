import { describe, expect, it } from "vitest";
import type { Automation, AutomationDraft } from "./api/client";
import {
  cronToSchedule,
  EDITOR_TEMPLATES,
  editorFrom,
  emptyEditor,
  isDirty,
  kindOf,
  momentOf,
  nextCronRuns,
  partsKey,
  previewSource,
  problemsByStep,
  problemsOfError,
  scheduleToCron,
  shortestGapMinutes,
  toParts,
  wallClock,
  type Schedule,
} from "./automation-editor";
import { automationFlow } from "./automation-flow";

const NOW = new Date("2026-10-16T10:00:00Z");
const schedule = (over: Partial<Schedule>): Schedule => ({ kind: "days", days: [0, 1, 2, 3, 4, 5, 6], time: "09:00", hours: 4, cron: "", ...over });

describe("schedule builder and cron lines", () => {
  it("days and a time become a cron line, both ways", () => {
    const cases: [Schedule, string][] = [
      [schedule({}), "0 9 * * *"],
      [schedule({ days: [1, 2, 3, 4, 5], time: "08:30" }), "30 8 * * 1-5"],
      [schedule({ days: [1], time: "09:00" }), "0 9 * * 1"],
      [schedule({ days: [6, 0], time: "18:05" }), "5 18 * * 0,6"],
      [schedule({ kind: "hours", hours: 4 }), "0 */4 * * *"],
      [schedule({ kind: "hours", hours: 1 }), "0 * * * *"],
    ];
    for (const [given, line] of cases) {
      expect(scheduleToCron(given)).toBe(line);
      const back = cronToSchedule(line);
      expect(back.kind).toBe(given.kind);
      if (given.kind === "days") {
        expect(back.days).toEqual([...given.days].sort((a, b) => a - b));
        expect(back.time).toBe(given.time);
      } else expect(back.hours).toBe(given.hours);
    }
  });

  it("any other shape stays a cron line for experts", () => {
    for (const line of ["0 10 1 * *", "*/30 * * * *", "0 9-17 * * 1-5", "nonsense"]) {
      const back = cronToSchedule(line);
      expect(back.kind).toBe("cron");
      expect(scheduleToCron(back)).toBe(line);
    }
    expect(cronToSchedule("0  9 * *   1").kind).toBe("days");
    expect(cronToSchedule("0 9 * * 7").days).toEqual([0]);
  });
});

describe("time zones", () => {
  it("a date and a time in a zone are one moment, and back", () => {
    expect(momentOf("2026-10-20", "09:00", "Asia/Kolkata")).toBe("2026-10-20T03:30:00.000Z");
    expect(momentOf("2026-07-01", "09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
    expect(momentOf("2026-12-01", "09:00", "Europe/London")).toBe("2026-12-01T09:00:00.000Z");
    expect(wallClock("2026-10-20T03:30:00.000Z", "Asia/Kolkata")).toEqual({ date: "2026-10-20", time: "09:00" });
    expect(momentOf("2026-10-20", "", "Asia/Kolkata")).toBeNull();
    expect(momentOf("2026-10-20", "09:00", "Mars/Base")).toBeNull();
  });

  it("the next runs of a cron line, in its zone", () => {
    const runs = nextCronRuns("0 9 * * 1", "Asia/Kolkata", 3, NOW)!;
    // 16 Oct 2026 is a Friday: the next Mondays are 19, 26 Oct and 2 Nov, at 03:30 UTC.
    expect(runs.map((run) => run.toISOString())).toEqual(["2026-10-19T03:30:00.000Z", "2026-10-26T03:30:00.000Z", "2026-11-02T03:30:00.000Z"]);
    expect(nextCronRuns("0 */4 * * *", "UTC", 2, NOW)!.map((run) => run.toISOString())).toEqual(["2026-10-16T12:00:00.000Z", "2026-10-16T16:00:00.000Z"]);
    expect(nextCronRuns("0 10 1 * *", "UTC", 1, NOW)![0].toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(nextCronRuns("bad line", "UTC", 1, NOW)).toBeNull();
    expect(shortestGapMinutes("*/5 * * * *", "UTC", NOW)).toBe(5);
    expect(shortestGapMinutes("0 9 * * *", "UTC", NOW)).toBe(1440);
  });
});

const automation: Automation = {
  id: "aut_1",
  kind: "repeat",
  title: "Monday PRs",
  instruction: "List my open pull requests.",
  runAt: null,
  cron: "0 9 * * 1",
  timezone: "Asia/Kolkata",
  trigger: null,
  apps: ["github"],
  askFirst: "risky",
  copyTo: "telegram",
  preset: null,
  enabled: true,
  pausedReason: null,
  nextRunAt: null,
  lastRunAt: null,
  createdAt: NOW.toISOString(),
};

describe("the form from and to the API", () => {
  it("an automation opens as the form, and saves as the same parts", () => {
    const form = editorFrom(automation, "UTC", NOW);
    expect(form.mode).toBe("schedule");
    expect(form.schedule).toMatchObject({ kind: "days", days: [1], time: "09:00" });
    expect(form.timezone).toBe("Asia/Kolkata");
    expect(toParts(form)).toEqual({
      title: "Monday PRs",
      instruction: "List my open pull requests.",
      runAt: null,
      cron: "0 9 * * 1",
      timezone: "Asia/Kolkata",
      trigger: null,
      apps: ["github"],
      askFirst: "risky",
      copyTo: "telegram",
    });
    expect(isDirty(form, editorFrom(automation, "UTC", NOW))).toBe(false);
    expect(isDirty({ ...form, title: "Monday pull requests" }, form)).toBe(true);
    // Only what is saved counts: trailing spaces and a switch of mode that is switched back don't.
    expect(isDirty({ ...form, title: "Monday PRs  " }, form)).toBe(false);
  });

  it("a one-time moment opens in its zone; an app event keeps its settings, without empty ones", () => {
    const once = editorFrom({ ...automation, kind: "once", cron: null, runAt: "2026-10-20T03:30:00.000Z" }, "UTC", NOW);
    expect(once).toMatchObject({ mode: "once", date: "2026-10-20", time: "09:00" });
    expect(toParts(once).runAt).toBe("2026-10-20T03:30:00.000Z");

    const draft = {
      ...automation,
      kind: "event",
      cron: null,
      trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: { labelIds: "INBOX" } },
    } as unknown as AutomationDraft;
    const event = editorFrom(draft, "UTC", NOW);
    expect(event.mode).toBe("event");
    event.event.config.query = "";
    expect(toParts(event).trigger).toEqual({ app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: { labelIds: "INBOX" } });
    expect(kindOf(event)).toBe("event");
  });

  it("an empty canvas has nothing picked, in the person's zone, and asks first as the platform does", () => {
    const empty = emptyEditor("Asia/Kolkata", NOW);
    expect(empty).toMatchObject({ mode: null, title: "", instruction: "", timezone: "Asia/Kolkata", askFirst: "risky", copyTo: null, apps: [] });
    expect(empty.date).toBe("2026-10-17");
    expect(toParts(empty)).toMatchObject({ runAt: null, cron: null, trigger: null });
    expect(kindOf(empty)).toBeNull();
    expect(emptyEditor("Nowhere/Land", NOW).timezone).toBe("UTC");
    expect(partsKey(empty)).toBe(partsKey(emptyEditor("Asia/Kolkata", NOW)));
  });

  it("the canvas draws the form as it is being built, the stricter rule included", () => {
    const form = { ...editorFrom(automation, "UTC", NOW), askFirst: "changes" as const, apps: ["github", "slack"] };
    const steps = automationFlow(previewSource(form), "Asia/Kolkata", NOW);
    expect(steps[0].title).toBe("Every Monday at 9:00 AM, your time");
    expect(steps[2].apps).toEqual(["github", "slack"]);
    expect(steps[3].title).toBe("Anything that changes something waits for your OK");
  });

  it("every template fills a form that makes one kind of automation", () => {
    for (const template of EDITOR_TEMPLATES) {
      const form = template.fill(emptyEditor("UTC", NOW));
      expect(kindOf(form)).not.toBeNull();
      expect(form.title.length).toBeGreaterThan(0);
      expect(form.instruction.length).toBeGreaterThan(0);
    }
  });
});

describe("problems, box by box", () => {
  it("each problem goes on its box; the plan's limit goes on the whole", () => {
    const read = problemsByStep([
      { step: "trigger", code: "past", message: "That moment has passed." },
      { step: "trigger", code: "invalid", message: "Pick a time zone." },
      { step: "apps", code: "invalid", message: "Connect Slack first." },
      { step: null, code: "plan_limit", message: "Your Free plan allows 1 automation." },
    ]);
    expect(read.byStep.get("trigger")).toEqual(["That moment has passed.", "Pick a time zone."]);
    expect(read.byStep.get("apps")).toEqual(["Connect Slack first."]);
    expect(read.byStep.has("instruction")).toBe(false);
    expect(read.general).toHaveLength(1);
    expect(read.planLimit).toBe(true);
    expect(problemsByStep(undefined).planLimit).toBe(false);
  });

  it("a refused save's details are read as problems when they are there", () => {
    expect(problemsOfError({ problems: [{ step: "instruction", code: "invalid", message: "Write what Tex should do." }] })).toHaveLength(1);
    expect(problemsOfError({ status: "saved" })).toBeNull();
    expect(problemsOfError(undefined)).toBeNull();
  });
});
