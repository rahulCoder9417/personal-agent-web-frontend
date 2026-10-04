import { describe, expect, it } from "vitest";
import type { Memory } from "./api/client";
import { describeMemorySaved, describeMemoryUse, groupMemories, memoryCapacity, memoryHref } from "./memory";

const NOW = new Date("2026-10-04T12:00:00");

function memory(id: string, kind: Memory["kind"], extra: Partial<Memory> = {}): Memory {
  return { id, kind, content: id, createdAt: "2026-09-20T09:00:00", updatedAt: "2026-09-20T09:00:00", lastUsedAt: null, useCount: 0, ...extra };
}

describe("groupMemories", () => {
  it("groups by kind, standing instructions first, and keeps the order inside a group", () => {
    const groups = groupMemories([memory("a", "fact"), memory("b", "preference"), memory("c", "instruction"), memory("d", "preference"), memory("e", "person")]);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Standing instructions", ["c"]],
      ["Preferences", ["b", "d"]],
      ["People", ["e"]],
      ["Other facts", ["a"]],
    ]);
  });

  it("leaves out a kind with nothing in it", () => {
    expect(groupMemories([])).toEqual([]);
    expect(groupMemories([memory("p", "project")]).map((group) => group.kind)).toEqual(["project"]);
  });
});

describe("describeMemorySaved", () => {
  it("says when it was saved, and when Tex corrected it", () => {
    expect(describeMemorySaved(memory("a", "fact"), NOW)).toBe("saved 20 Sep");
    expect(describeMemorySaved(memory("a", "fact", { updatedAt: "2026-10-02T10:00:00" }), NOW)).toBe("saved 20 Sep · corrected 2 Oct");
  });
});

describe("describeMemoryUse", () => {
  it("says how often Tex found it, and when last", () => {
    expect(describeMemoryUse(memory("a", "fact"), NOW)).toBe("not looked up yet");
    expect(describeMemoryUse(memory("a", "fact", { useCount: 1, lastUsedAt: "2026-10-04T10:00:00" }), NOW)).toBe("looked up once, last 2h ago");
    expect(describeMemoryUse(memory("a", "fact", { useCount: 4, lastUsedAt: "2026-10-03T10:00:00" }), NOW)).toBe("looked up 4 times, last yesterday");
    expect(describeMemoryUse(memory("a", "fact", { useCount: 2, lastUsedAt: "2026-09-25T10:00:00" }), NOW)).toBe("looked up 2 times, last 25 Sep");
  });
});

describe("memoryCapacity", () => {
  it("counts against the maximum and says when it is full", () => {
    expect(memoryCapacity(8, 200)).toEqual({ text: "8 of 200 saved", percent: 4, full: false });
    expect(memoryCapacity(200, 200)).toEqual({ text: "200 of 200 saved", percent: 100, full: true });
    expect(memoryCapacity(0, 200)).toMatchObject({ percent: 0, full: false });
  });
});

describe("memoryHref", () => {
  it("opens the Memory screen on one memory", () => {
    expect(memoryHref("mem_01jb2k")).toBe("/settings/memory?memory=mem_01jb2k");
  });
});
