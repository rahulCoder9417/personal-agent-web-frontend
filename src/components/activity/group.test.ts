import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "@/lib/api/client";
import { actionLabel, creditsToday, describeActivity, groupByDay, matchesFilter, memoryLink } from "./group";

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

  it("reads a new chat as the person's", () => {
    const started = entry("n", "2026-10-01T14:22:00", { actor: "user", action: "chat_started", summary: "Started a new chat in web chat" });
    expect(describeActivity(started)).toEqual({ crew: null, who: "You", label: "started a new chat", summary: "Started a new chat in web chat" });
    expect(matchesFilter(started, "you")).toBe(true);
  });
});

describe("memory in the log", () => {
  const at = "2026-10-01T14:20:00";
  const saved = entry("m1", at, { action: "remember", summary: "Saved a memory (preference)", memoryId: "mem_1" });
  const corrected = entry("m2", at, { action: "forget", summary: "Corrected a memory", memoryId: "mem_1" });
  const removed = entry("m3", at, { action: "forget", summary: "Removed a memory", memoryId: "mem_2" });
  const searched = entry("m4", at, { action: "recall", summary: "Searched memory (2 found)", memoryId: null });
  const refused = entry("m5", at, { action: "memory_refused", summary: "Refused to save a memory: it looked like an API key" });
  const deleted = entry("m6", at, { actor: "user", action: "memory_deleted", summary: "Deleted a memory", memoryId: "mem_2" });
  const cleared = entry("m7", at, { actor: "user", action: "memories_cleared", summary: "Deleted all memories (8)" });
  const all = [saved, corrected, removed, searched, refused, deleted, cleared];

  it("says who did what with it", () => {
    expect(all.map((e) => `${describeActivity(e).who} · ${describeActivity(e).label}`)).toEqual([
      "Tex · remembered",
      "Tex · corrected a memory",
      "Tex · forgot",
      "Tex · looked up memory",
      "Tex · refused to save",
      "You · deleted a memory",
      "You · cleared memory",
    ]);
  });

  it("filters to memory entries, whoever made them", () => {
    expect([...ENTRIES, ...all].filter((e) => matchesFilter(e, "memory")).map((e) => e.id)).toEqual(all.map((e) => e.id));
    expect(matchesFilter(deleted, "you")).toBe(true);
  });

  it("links to a memory only while it still exists", () => {
    const existing = new Set(["mem_1"]);
    expect(memoryLink(saved, existing)).toBe("/settings/memory?memory=mem_1");
    expect(memoryLink(corrected, existing)).toBe("/settings/memory?memory=mem_1");
    // Deleted since, by Tex or by the person: nothing to show.
    expect(memoryLink(removed, existing)).toBeNull();
    expect(memoryLink(deleted, existing)).toBeNull();
    // No memory named at all.
    expect(memoryLink(searched, existing)).toBeNull();
    expect(memoryLink(refused, existing)).toBeNull();
    expect(memoryLink(ENTRIES[0], existing)).toBeNull();
  });
});

describe("creditsToday", () => {
  it("adds up only today's charges", () => {
    expect(creditsToday(ENTRIES, NOW)).toBe(3);
  });
});
