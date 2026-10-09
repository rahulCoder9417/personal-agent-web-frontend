import { describe, expect, it } from "vitest";
import type { CrewMember } from "./api/client";
import {
  addProgress,
  CREW_GUIDE,
  CREW_STEPS,
  crewBrowser,
  crewHeadline,
  crewNavNote,
  describeAvailability,
  describeBrowser,
  progressLine,
  splitCrew,
  splitCrewLine,
} from "./crew";

function crew(available: CrewMember["id"][], browserBuilt = false): CrewMember[] {
  const member = (id: CrewMember["id"], name: string, role: string, kind: CrewMember["kind"] = "specialist"): CrewMember => ({
    id,
    name,
    kind,
    role,
    description: `${name} does its job.`,
    available: kind === "lead" || available.includes(id),
    browser: id === "scout" ? { requiresPlan: "max", available: browserBuilt, enabled: false } : null,
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

describe("the crew page's own words", () => {
  it("says three things each member does, and gives a request to try", () => {
    for (const member of crew(["byte", "patch", "scout"])) {
      const guide = CREW_GUIDE[member.id];
      expect(guide.does).toHaveLength(3);
      expect(guide.does.every((line) => line.length > 0 && line.length <= 70)).toBe(true);
      expect(guide.example.length).toBeGreaterThan(10);
    }
  });

  it("keeps the promises the crew is built on", () => {
    expect(CREW_GUIDE.byte.does.join(" ")).toMatch(/new branch/);
    expect(CREW_GUIDE.patch.does.join(" ")).toMatch(/never merges/);
    expect(CREW_GUIDE.scout.does.join(" ")).toMatch(/only one on the web/);
  });

  it("says who works here, who leads and who is still to come", () => {
    const [tex, byte, patch] = crew(["byte"]);
    expect(describeAvailability(tex)).toEqual({ label: "Leads your crew", tone: "done" });
    expect(describeAvailability(byte)).toEqual({ label: "On your crew", tone: "done" });
    expect(describeAvailability(patch)).toEqual({ label: "Coming soon", tone: "muted" });
  });

  it("explains how a job moves through the crew in a few steps", () => {
    expect(CREW_STEPS.length).toBeGreaterThanOrEqual(3);
    expect(CREW_STEPS[0].title).toBe("You text Tex");
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
    expect(crewBrowser(crew([]))).toEqual({ requiresPlan: "max", available: false, enabled: false });
    expect(crewBrowser(undefined)).toBeNull();
    expect(crewBrowser(crew([]).filter((m) => m.id !== "scout"))).toBeNull();
  });

  it("keeps 'built yet' apart from 'on your plan'", () => {
    const built = { requiresPlan: "max" as const, available: true, enabled: false };
    const notBuilt = { requiresPlan: "max" as const, available: false, enabled: false };
    expect(describeBrowser(notBuilt, "Max", false)).toEqual({ text: "A real browser isn’t ready yet. It will need the Max plan.", upgrade: false });
    expect(describeBrowser(notBuilt, "Max", true).text).toBe("A real browser isn’t ready yet. It comes with your Max plan when it is.");
    expect(describeBrowser(built, "Max", false)).toEqual({ text: "A real browser needs the Max plan.", upgrade: true });
    expect(describeBrowser(built, "Max", true)).toEqual({ text: "A real browser is part of your Max plan, at 2 credits per minute.", upgrade: false });
  });
});

describe("progress lines", () => {
  const at = "2026-10-04T10:00:00.000Z";

  it("takes the member's name off the front of its line", () => {
    expect(splitCrewLine("Scout: reading 4 pages", "scout")).toEqual({ who: "scout", name: "Scout", text: "reading 4 pages" });
    expect(splitCrewLine("  Patch:   done ", "patch")).toEqual({ who: "patch", name: "Patch", text: "done" });
    expect(splitCrewLine("Byte:", "byte")).toEqual({ who: "byte", name: "Byte", text: "working" });
  });

  it("leaves a line alone when the name on it isn't that member's", () => {
    expect(splitCrewLine("Note: reading 4 pages", "scout")).toEqual({ who: "scout", name: "Scout", text: "Note: reading 4 pages" });
    expect(splitCrewLine("reading 4 pages", "scout")).toEqual({ who: "scout", name: "Scout", text: "reading 4 pages" });
  });

  it("gives a line that names nobody to Tex", () => {
    expect(splitCrewLine("using web_search", null)).toEqual({ who: "tex", name: "Tex", text: "using web_search" });
    expect(progressLine({ text: "Scout: reading 4 pages", crew: "scout", at })).toEqual({ who: "scout", name: "Scout", text: "reading 4 pages", at });
  });

  it("keeps the latest line of each member, in the order they last spoke", () => {
    const line = (text: string, crew: "byte" | "patch" | "scout" | null) => progressLine({ text, crew, at });
    let lines = addProgress([], line("Scout: searching", "scout"));
    lines = addProgress(lines, line("Byte: writing the fix", "byte"));
    lines = addProgress(lines, line("Scout: reading 4 pages", "scout"));
    expect(lines.map((l) => `${l.name} ${l.text}`)).toEqual(["Byte writing the fix", "Scout reading 4 pages"]);

    lines = addProgress(lines, line("using list_app_actions", null));
    lines = addProgress(lines, line("Patch: running the tests", "patch"));
    expect(lines.map((l) => l.who)).toEqual(["byte", "scout", "tex", "patch"]);
    // Never more than there is room for.
    expect(addProgress(lines, line("Scout: done", "scout"), 2).map((l) => l.who)).toEqual(["patch", "scout"]);
  });
});
