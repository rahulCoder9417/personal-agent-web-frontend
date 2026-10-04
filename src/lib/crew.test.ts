import { describe, expect, it } from "vitest";
import type { CrewMember } from "./api/client";
import { crewBrowser, crewHeadline, crewNavNote, describeBrowser, splitCrew } from "./crew";

function crew(available: CrewMember["id"][], browserBuilt = false): CrewMember[] {
  const member = (id: CrewMember["id"], name: string, role: string, kind: CrewMember["kind"] = "specialist"): CrewMember => ({
    id,
    name,
    kind,
    role,
    description: `${name} does its job.`,
    available: kind === "lead" || available.includes(id),
    browser: id === "scout" ? { requiresPlan: "max", available: browserBuilt } : null,
  });
  return [member("tex", "Tex", "Lead", "lead"), member("byte", "Byte", "Coding"), member("patch", "Patch", "Code review"), member("scout", "Scout", "Research")];
}

describe("splitCrew", () => {
  it("separates the lead, who works now and who is coming", () => {
    const split = splitCrew(crew(["byte", "scout"]));
    expect(split.lead?.id).toBe("tex");
    expect(split.working.map((m) => m.id)).toEqual(["byte", "scout"]);
    expect(split.coming.map((m) => m.id)).toEqual(["patch"]);
  });

  it("copes with an empty list", () => {
    expect(splitCrew([])).toEqual({ lead: undefined, working: [], coming: [] });
  });
});

describe("crewHeadline", () => {
  it("names who works and who is on the way", () => {
    expect(crewHeadline(crew(["byte", "patch", "scout"]))).toBe("Tex leads and hands work to Byte, Patch and Scout.");
    expect(crewHeadline(crew(["byte"]))).toBe("Tex leads and hands work to Byte. Patch and Scout are on the way.");
    expect(crewHeadline(crew(["byte", "patch"]))).toBe("Tex leads and hands work to Byte and Patch. Scout is on the way.");
    expect(crewHeadline(crew([]))).toBe("Tex is on the job today. Byte, Patch and Scout are on the way.");
  });
});

describe("crewNavNote", () => {
  it("says soon only while no specialist works", () => {
    expect(crewNavNote(undefined)).toBeUndefined();
    expect(crewNavNote(crew([]))).toBe("soon");
    expect(crewNavNote(crew(["scout"]))).toBeUndefined();
  });
});

describe("the browser", () => {
  it("is read from the member that has one", () => {
    expect(crewBrowser(crew([]))).toEqual({ requiresPlan: "max", available: false });
    expect(crewBrowser(undefined)).toBeNull();
    expect(crewBrowser(crew([]).filter((m) => m.id !== "scout"))).toBeNull();
  });

  it("keeps 'built yet' apart from 'on your plan'", () => {
    const built = { requiresPlan: "max" as const, available: true };
    const notBuilt = { requiresPlan: "max" as const, available: false };
    expect(describeBrowser(notBuilt, "Max", false)).toEqual({ text: "A real browser isn’t ready yet. It will need the Max plan.", upgrade: false });
    expect(describeBrowser(notBuilt, "Max", true).text).toBe("A real browser isn’t ready yet. It comes with your Max plan when it is.");
    expect(describeBrowser(built, "Max", false)).toEqual({ text: "A real browser needs the Max plan.", upgrade: true });
    expect(describeBrowser(built, "Max", true)).toEqual({ text: "A real browser is part of your Max plan, at 2 credits per minute.", upgrade: false });
  });
});
