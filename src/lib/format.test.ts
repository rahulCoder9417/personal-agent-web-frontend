import { describe, expect, it } from "vitest";
import {
  describeAutomationNext,
  describeCron,
  formatAgo,
  formatCredits,
  formatDay,
  formatMoney,
  formatTimeLeft,
  initials,
  titleCase,
} from "./format";
import type { Automation } from "./api/client";

const NOW = new Date("2026-10-01T14:30:00");

describe("describeCron", () => {
  it("puts the common schedules into words", () => {
    expect(describeCron("0 9 * * 1")).toBe("Every Monday · 9:00");
    expect(describeCron("0 8 * * 1-5")).toBe("Weekdays · 8:00");
    expect(describeCron("30 18 * * *")).toBe("Every day · 18:30");
    expect(describeCron("0 9 1 * *")).toBe("Day 1 of the month · 9:00");
    expect(describeCron("0 10 * * 1,4")).toBe("Every Monday, Thursday · 10:00");
  });

  it("leaves anything it doesn't understand alone", () => {
    expect(describeCron("*/15 * * * *")).toBe("*/15 * * * *");
    expect(describeCron("not a cron")).toBe("not a cron");
  });
});

describe("dates", () => {
  it("names nearby days", () => {
    expect(formatDay("2026-10-01T09:00:00", NOW)).toBe("Today");
    expect(formatDay("2026-09-30T09:00:00", NOW)).toBe("Yesterday");
    expect(formatDay("2026-10-02T09:00:00", NOW)).toBe("Tomorrow");
    expect(formatDay("2026-09-12T09:00:00", NOW)).toBe("Sat 12 Sep");
  });

  it("counts down to a deadline", () => {
    expect(formatTimeLeft("2026-10-02T14:11:00", NOW)).toBe("23h 41m left");
    expect(formatTimeLeft("2026-10-01T14:42:00", NOW)).toBe("12m left");
    expect(formatTimeLeft("2026-10-01T14:00:00", NOW)).toBe("expired");
  });

  it("says how long ago", () => {
    expect(formatAgo("2026-10-01T14:29:40", NOW)).toBe("just now");
    expect(formatAgo("2026-10-01T14:05:00", NOW)).toBe("25 min ago");
    expect(formatAgo("2026-10-01T09:30:00", NOW)).toBe("5h ago");
    expect(formatAgo("2026-09-30T20:00:00", NOW)).toBe("Yesterday");
  });
});

describe("numbers", () => {
  it("formats credits and money", () => {
    expect(formatCredits(1)).toBe("1 credit");
    expect(formatCredits(1884)).toBe("1,884 credits");
    expect(formatMoney(1200)).toBe("$12");
    expect(formatMoney(1250)).toBe("$12.50");
  });

  it("names apps and categories properly", () => {
    expect(titleCase("hubspot")).toBe("HubSpot");
    expect(titleCase("crm")).toBe("CRM");
    expect(titleCase("google_calendar")).toBe("Google Calendar");
    expect(titleCase("notion")).toBe("Notion");
    expect(titleCase("team-chat")).toBe("Team Chat");
  });

  it("makes initials", () => {
    expect(initials("Aarav Shah")).toBe("AS");
    expect(initials("Maya")).toBe("M");
    expect(initials("  ")).toBe("?");
  });
});

describe("describeAutomationNext", () => {
  const base: Automation = {
    id: "a1",
    kind: "repeat",
    title: "t",
    instruction: "i",
    enabled: true,
    createdAt: "2026-09-01T00:00:00Z",
  };

  it("explains why a paused automation is paused", () => {
    expect(describeAutomationNext({ ...base, enabled: false, pausedReason: "out_of_credits" })).toBe("Paused, out of credits");
    expect(describeAutomationNext({ ...base, enabled: false, pausedReason: "failures" })).toBe("Paused after failures");
    expect(describeAutomationNext({ ...base, enabled: false, pausedReason: "user" })).toBe("Paused by you");
  });

  it("says what a trigger is watching", () => {
    expect(describeAutomationNext({ ...base, kind: "event", trigger: { app: "gmail", event: "NEW_EMAIL" } })).toBe("Watching Gmail");
  });
});
