import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "@/lib/api/client";
import { creditsToday, groupByDay, matchesFilter } from "./group";

const NOW = new Date("2026-10-01T14:30:00");

function entry(id: string, createdAt: string, extra: Partial<ActivityEntry> = {}): ActivityEntry {
  return { id, actor: "agent", action: "run_app_action", summary: id, createdAt, ...extra };
}

const ENTRIES = [
  entry("a", "2026-10-01T14:14:00", { creditsCharged: 2 }),
  entry("b", "2026-10-01T08:00:00", { actor: "system", action: "automation_run", creditsCharged: 1 }),
  entry("c", "2026-09-30T17:31:00", { actor: "user", action: "approval_decided", creditsCharged: null }),
  entry("d", "2026-09-12T10:00:00", { actor: "user", action: "coupon_redeemed" }),
];

describe("groupByDay", () => {
  it("puts one heading over each day and keeps the order", () => {
    const days = groupByDay(ENTRIES, NOW);
    expect(days.map((d) => d.label)).toEqual(["Today · Thu 1 Oct", "Yesterday · Wed 30 Sep", "Sat 12 Sep"]);
    expect(days.map((d) => d.entries.map((e) => e.id))).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("returns nothing for an empty log", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("matchesFilter", () => {
  const ids = (filter: Parameters<typeof matchesFilter>[1]) => ENTRIES.filter((e) => matchesFilter(e, filter)).map((e) => e.id);

  it("filters by who did it and by what it was", () => {
    expect(ids("all")).toEqual(["a", "b", "c", "d"]);
    expect(ids("tex")).toEqual(["a"]);
    expect(ids("you")).toEqual(["c", "d"]);
    expect(ids("automations")).toEqual(["b"]);
    expect(ids("approvals")).toEqual(["c"]);
  });
});

describe("creditsToday", () => {
  it("adds up only today's charges", () => {
    expect(creditsToday(ENTRIES, NOW)).toBe(3);
  });
});
