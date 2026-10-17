import { describe, expect, it } from "vitest";
import type { AgentSettings } from "./api/client";
import {
  choiceNotes,
  choiceValue,
  chosenModel,
  CREW_HINT,
  CREW_ROWS,
  crewChoicesOffered,
  crewDefaultOptions,
  crewEffortApplies,
  crewEffortOptions,
  crewEfforts,
  crewModelOptions,
  crewNotes,
  effortApplies,
  effortLabel,
  effortOptions,
  groupLabel,
  modelEfforts,
  modelOptions,
  optionGroups,
  withCrewPatch,
} from "./claude-code";
import { CLAUDE_CHOICES } from "./demo/seed";

type Choices = AgentSettings["claudeChoices"];
const ALL: Choices["efforts"] = ["low", "medium", "high", "xhigh", "max"];

const CHOICES: Choices = {
  models: [
    { id: "claude-opus-5-5", label: "Opus 5.5", group: "current", efforts: ALL },
    { id: "claude-fable-5-1", label: "Fable 5.1", group: "current", efforts: ALL, note: "Uses usage credits on Pro." },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", group: "older", efforts: ["low", "medium", "high", "max"] },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", group: "older", efforts: [] },
  ],
  efforts: ALL,
  crewDefaults: {
    byte: { model: "claude-opus-5-5", effort: "medium" },
    patch: { model: "claude-opus-5-5", effort: "medium" },
    scout: { model: null, effort: null },
  },
};

const settings = (claudeModel: string | null, claudeEffort: AgentSettings["claudeEffort"] = null, claudeChoices = CHOICES) => ({
  claudeModel,
  claudeEffort,
  claudeChoices,
});

describe("modelOptions", () => {
  it("offers Default first, then the backend's models in its order, each under its group, with its note", () => {
    expect(modelOptions(settings(null))).toEqual([
      { value: "", label: "Default (Sonnet 5.5, quick)" },
      { value: "claude-opus-5-5", label: "Opus 5.5", group: "Current models" },
      { value: "claude-fable-5-1", label: "Fable 5.1", group: "Current models", note: "Uses usage credits on Pro." },
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6", group: "Older models" },
      { value: "claude-haiku-4-5", label: "Haiku 4.5", group: "Older models" },
    ]);
  });

  it("keeps a saved model the backend no longer offers, so the select shows what is set", () => {
    const options = modelOptions(settings("claude-old-4"));
    expect(options.at(-1)).toEqual({ value: "claude-old-4", label: "claude-old-4" });
    expect(modelOptions(settings("claude-opus-5-5"))).toHaveLength(5);
  });

  it("lists every model the demo offers: the current ones, then the older ones", () => {
    const groups = optionGroups(modelOptions(settings(null, null, CLAUDE_CHOICES)));
    expect(groups.map((group) => [group.label, group.options.map((option) => option.label)])).toEqual([
      [null, ["Default (Sonnet 5.5, quick)"]],
      ["Current models", ["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "Fable 5.1"]],
      [
        "Older models",
        ["Fable 5", "Opus 5", "Sonnet 5", "Opus 4.8", "Opus 4.7", "Opus 4.6", "Sonnet 4.6", "Opus 4.5", "Haiku 4.5"],
      ],
    ]);
  });
});

describe("optionGroups", () => {
  it("splits where the heading changes and keeps the order", () => {
    const groups = optionGroups([
      { value: "", label: "Default" },
      { value: "a", label: "A", group: "One" },
      { value: "b", label: "B", group: "One" },
      { value: "c", label: "C", group: "Two" },
      { value: "old", label: "old" },
    ]);
    expect(groups.map((group) => [group.label, group.options.map((option) => option.value)])).toEqual([
      [null, [""]],
      ["One", ["a", "b"]],
      ["Two", ["c"]],
      [null, ["old"]],
    ]);
  });

  it("reads a group it doesn't know as the backend names it", () => {
    expect(groupLabel("current")).toBe("Current models");
    expect(groupLabel("preview")).toBe("Preview");
  });
});

describe("effortOptions", () => {
  it("offers Default first, then each level in words: all of them on Default", () => {
    expect(effortOptions(settings(null, "xhigh"))).toEqual([
      { value: "", label: "Default (Low)" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "Extra high" },
      { value: "max", label: "Max" },
    ]);
  });

  it("says what Default is: low on the default model, Claude Code's own for a chosen one", () => {
    expect(effortOptions(settings(null))[0]).toEqual({ value: "", label: "Default (Low)" });
    expect(effortOptions(settings("claude-opus-5-5"))[0]).toEqual({ value: "", label: "Default" });
    expect(modelOptions(settings("claude-opus-5-5"))[0]).toEqual({ value: "", label: "Default (Sonnet 5.5, quick)" });
  });

  it("offers only the levels the chosen model takes", () => {
    expect(effortOptions(settings("claude-sonnet-4-6")).map((option) => option.value)).toEqual(["", "low", "medium", "high", "max"]);
    expect(effortOptions(settings("claude-haiku-4-5")).map((option) => option.value)).toEqual([""]);
    // A model the backend no longer offers: every level, as on Default.
    expect(modelEfforts(settings("claude-old-4"))).toEqual(ALL);
  });

  it("still shows a saved level the chosen model doesn't take", () => {
    expect(effortOptions(settings("claude-sonnet-4-6", "xhigh")).at(-1)).toEqual({ value: "xhigh", label: "Extra high" });
  });

  it("applies only to a model with effort levels", () => {
    expect(effortApplies(settings(null))).toBe(true);
    expect(effortApplies(settings("claude-sonnet-4-6"))).toBe(true);
    expect(effortApplies(settings("claude-haiku-4-5", "high"))).toBe(false);
  });

  it("reads a level it doesn't know as the backend names it", () => {
    expect(effortLabel("turbo")).toBe("Turbo");
  });
});

describe("choiceNotes", () => {
  it("says nothing for Default, or a model with no note and a level it takes", () => {
    expect(choiceNotes(settings(null, "max"))).toEqual([]);
    expect(choiceNotes(settings("claude-opus-5-5", "xhigh"))).toEqual([]);
    expect(choiceNotes(settings("claude-old-4", "xhigh"))).toEqual([]);
    expect(chosenModel(settings("claude-old-4"))).toBeUndefined();
  });

  it("shows the chosen model's note", () => {
    expect(choiceNotes(settings("claude-fable-5-1"))).toEqual(["Fable 5.1: Uses usage credits on Pro."]);
  });

  it("says when the effort doesn't apply, and the level a model runs a level it doesn't take at", () => {
    expect(choiceNotes(settings("claude-haiku-4-5", "high"))).toEqual(["Haiku 4.5 has no thinking effort, so this setting doesn’t apply to it."]);
    expect(choiceNotes(settings("claude-sonnet-4-6", "xhigh"))).toEqual(["Sonnet 4.6 doesn’t take Extra high: it thinks at High."]);
  });
});

describe("a backend from before model groups and levels", () => {
  // Vercel can put the web app live before the server is updated: its models have only an id and a label.
  const OLD = { models: [{ id: "claude-opus-5-5", label: "Opus 5.5" }], efforts: ALL } as unknown as Choices;

  it("lists the models with no heading, offers every level and says nothing", () => {
    expect(modelOptions(settings("claude-opus-5-5", "high", OLD))).toEqual([
      { value: "", label: "Default (Sonnet 5.5, quick)" },
      { value: "claude-opus-5-5", label: "Opus 5.5" },
    ]);
    expect(modelEfforts(settings("claude-opus-5-5", "high", OLD))).toEqual(ALL);
    expect(effortApplies(settings("claude-opus-5-5", "high", OLD))).toBe(true);
    expect(choiceNotes(settings("claude-opus-5-5", "high", OLD))).toEqual([]);
  });
});

describe("choiceValue", () => {
  it("sends Default as null and anything else as it is", () => {
    expect(choiceValue("")).toBeNull();
    expect(choiceValue("xhigh")).toBe("xhigh");
  });
});

describe("the crew's own models and efforts", () => {
  type Crew = AgentSettings["claudeCrew"];
  const onDefault: Crew = { byte: { model: null, effort: null }, patch: { model: null, effort: null }, scout: { model: null, effort: null } };
  const crewSettings = (claudeCrew: Crew = onDefault, claudeModel: string | null = null) => ({ ...settings(claudeModel), claudeCrew });

  it("lists Tex, then Byte, Patch and Scout, each with what it does, and one hint", () => {
    expect(CREW_ROWS.map((row) => `${row.name}: ${row.does}`)).toEqual([
      "Tex: Leads, talks to you",
      "Byte: Writes code",
      "Patch: Reviews code",
      "Scout: Researches and uses the browser",
    ]);
    expect(CREW_HINT).toBe("Faster models answer sooner; stronger ones are more careful on hard code.");
  });

  it("says what Default runs, from what the backend says: Opus 5.5 at medium, or the same as Tex", () => {
    const s = crewSettings();
    expect(crewDefaultOptions(s, "byte")).toEqual({ model: { value: "", label: "Default (Opus 5.5)" }, effort: { value: "", label: "Default (Medium)" } });
    expect(crewDefaultOptions(s, "patch").model.label).toBe("Default (Opus 5.5)");
    expect(crewDefaultOptions(s, "scout")).toEqual({
      model: { value: "", label: "Default (same as Tex)" },
      effort: { value: "", label: "Default (same as Tex)" },
    });
    // The model list is Tex's, with the member's own Default first.
    expect(crewModelOptions(s, "byte")).toEqual([{ value: "", label: "Default (Opus 5.5)" }, ...modelOptions(settings(null)).slice(1)]);
  });

  it("offers the levels of the member's model: the chosen one's, its default's, or Tex's for Scout", () => {
    expect(crewEfforts(crewSettings(), "byte")).toEqual(ALL);
    const chosen = crewSettings({ ...onDefault, patch: { model: "claude-sonnet-4-6", effort: "xhigh" } });
    expect(crewEffortOptions(chosen, "patch").map((option) => option.label)).toEqual(["Default (Medium)", "Low", "Medium", "High", "Max", "Extra high"]);
    // Scout on Default runs on Tex's model: Haiku 4.5 takes no effort, so Scout's doesn't apply either.
    expect(crewEffortApplies(crewSettings(onDefault, "claude-haiku-4-5"), "scout")).toBe(false);
    expect(crewEffortApplies(crewSettings(onDefault, "claude-haiku-4-5"), "byte")).toBe(true);
    expect(crewEffortApplies(crewSettings({ ...onDefault, byte: { model: "claude-haiku-4-5", effort: null } }), "byte")).toBe(false);
  });

  it("says a model's note once, and an effort that doesn't apply by member", () => {
    const s = crewSettings(
      { byte: { model: "claude-fable-5-1", effort: null }, patch: { model: "claude-haiku-4-5", effort: null }, scout: { model: "claude-fable-5-1", effort: null } },
      "claude-fable-5-1",
    );
    const tex = choiceNotes(s);
    expect(tex).toEqual(["Fable 5.1: Uses usage credits on Pro."]);
    expect(crewNotes(s, tex)).toEqual(["Patch: Haiku 4.5 has no thinking effort, so this setting doesn’t apply to it."]);
    expect(crewNotes(crewSettings())).toEqual([]);
  });

  it("applies a change as the API will answer it: only the members and fields sent", () => {
    const s = crewSettings({ ...onDefault, patch: { model: "claude-sonnet-4-6", effort: "low" } });
    expect(withCrewPatch(s, { patch: { effort: null }, byte: { model: "claude-opus-5-5" } }).claudeCrew).toEqual({
      byte: { model: "claude-opus-5-5", effort: null },
      patch: { model: "claude-sonnet-4-6", effort: null },
      scout: { model: null, effort: null },
    });
    expect(s.claudeCrew.patch.effort).toBe("low");
  });

  it("knows when the backend doesn't offer the crew's choices yet (an older one)", () => {
    expect(crewChoicesOffered(crewSettings())).toBe(true);
    const older = { claudeModel: null, claudeEffort: null, claudeChoices: { models: CHOICES.models, efforts: ALL } } as unknown as Parameters<typeof crewChoicesOffered>[0];
    expect(crewChoicesOffered(older)).toBe(false);
    expect(withCrewPatch(older, { byte: { model: "claude-opus-5-5" } })).toBe(older);
  });
});
