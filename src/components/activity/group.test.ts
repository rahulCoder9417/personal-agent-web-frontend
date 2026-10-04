import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "@/lib/api/client";
import { actionLabel, creditsToday, describeActivity, groupByDay, matchesFilter } from "./group";

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

describe("the crew in the log", () => {
  const progress = entry("p", "2026-10-01T14:20:00", { action: "crew_progress", summary: "Scout: reading 4 pages", crew: "scout" });

  it("filters to what the specialists reported", () => {
    expect([...ENTRIES, progress].filter((e) => matchesFilter(e, "crew")).map((e) => e.id)).toEqual(["p"]);
    // A specialist's line is still something the agent did.
    expect(matchesFilter(progress, "tex")).toBe(true);
    expect(matchesFilter(entry("n", "2026-10-01T14:20:00", { crew: null }), "crew")).toBe(false);
  });

  it("shows an entry with a crew member as that member's", () => {
    expect(describeActivity(progress)).toEqual({ crew: "scout", who: "Scout", label: "progress", summary: "Reading 4 pages" });
    expect(describeActivity({ ...progress, summary: "Patch: done", crew: "patch" })).toMatchObject({ crew: "patch", who: "Patch", summary: "Done" });
  });

  it("leaves every other entry with who did it", () => {
    expect(describeActivity(ENTRIES[0])).toEqual({ crew: null, who: "Tex", label: "run app action", summary: "a" });
    expect(describeActivity(ENTRIES[1])).toMatchObject({ who: "Automation", label: "automation run" });
    expect(describeActivity(ENTRIES[2])).toMatchObject({ who: "You", label: "approval decided" });
  });
});

describe("actionLabel", () => {
  it("says plainly that a page was blocked", () => {
    expect(actionLabel("read_page_refused")).toBe("Blocked a page Scout wasn’t given");
    const refused = entry("r", "2026-10-01T14:21:00", { action: "read_page_refused", summary: "Refused to read https://collect.example/save" });
    expect(describeActivity(refused)).toEqual({
      crew: null,
      who: "Tex",
      label: "blocked a page Scout wasn’t given",
      summary: "Refused to read https://collect.example/save",
    });
  });

  it("names pull-request review in full, and leaves the rest as the backend named it", () => {
    expect(actionLabel("pr_review_requested")).toBe("pull-request review asked for");
    expect(actionLabel("pr_review_enabled")).toBe("pull-request review turned on");
    expect(actionLabel("web_search")).toBe("web search");
    expect(actionLabel("read_page")).toBe("read page");
    expect(actionLabel("coupon_redeemed")).toBe("coupon redeemed");
  });
});

describe("creditsToday", () => {
  it("adds up only today's charges", () => {
    expect(creditsToday(ENTRIES, NOW)).toBe(3);
  });
});
