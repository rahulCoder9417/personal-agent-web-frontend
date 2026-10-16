import { describe, expect, it } from "vitest";
import type { CrewMember } from "./api/client";
import { addProgress, comingSoon, CREW_COLOUR, CREW_EXAMPLES, crewBrowser, crewWash, progressLine, splitCrewLine } from "./crew";

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

describe("comingSoon", () => {
  it("names the specialists not switched on here yet, never the lead", () => {
    expect(comingSoon(crew(["byte", "scout"])).map((m) => m.id)).toEqual(["patch"]);
    expect(comingSoon(crew(["byte", "patch", "scout"]))).toEqual([]);
    expect(comingSoon(crew([])).map((m) => m.id)).toEqual(["byte", "patch", "scout"]);
    expect(comingSoon([])).toEqual([]);
  });
});

describe("the crew's own words", () => {
  it("gives each member a request to try in the chat", () => {
    for (const member of crew(["byte", "patch", "scout"])) expect(CREW_EXAMPLES[member.id].length).toBeGreaterThan(10);
  });

  it("asks Byte for a change and Patch for a review in plain words, with the repo named", () => {
    expect(CREW_EXAMPLES.byte).toMatch(/^Fix the typo in the README on my repo [\w-]+\/[\w-]+\.$/);
    expect(CREW_EXAMPLES.patch).toMatch(/^Review pull request \d+ in [\w-]+\/[\w-]+\.$/);
    // Byte's request doesn't say "pull request" or "review", so it can't be read as one for Patch.
    expect(CREW_EXAMPLES.byte).not.toMatch(/pull request|review/i);
  });

  it("gives each member its own colour from the design tokens", () => {
    expect(CREW_COLOUR).toEqual({ tex: "var(--accent)", byte: "var(--byte)", patch: "var(--patch)", scout: "var(--scout)" });
    expect(crewWash("byte", 16)).toEqual({ background: "color-mix(in srgb, var(--byte) 16%, var(--surface))" });
  });
});

describe("the browser", () => {
  it("is read from the member that has one", () => {
    expect(crewBrowser(crew([]))).toEqual({ requiresPlan: "max", available: false, enabled: false });
    expect(crewBrowser(undefined)).toBeNull();
    expect(crewBrowser(crew([]).filter((m) => m.id !== "scout"))).toBeNull();
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
