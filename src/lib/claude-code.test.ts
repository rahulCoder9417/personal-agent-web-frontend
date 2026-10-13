import { describe, expect, it } from "vitest";
import type { AgentSettings } from "./api/client";
import {
  choiceNotes,
  choiceValue,
  chosenModel,
  effortApplies,
  effortLabel,
  effortOptions,
  groupLabel,
  modelEfforts,
  modelOptions,
  optionGroups,
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
};

const settings = (claudeModel: string | null, claudeEffort: AgentSettings["claudeEffort"] = null, claudeChoices = CHOICES) => ({
  claudeModel,
  claudeEffort,
  claudeChoices,
});

describe("modelOptions", () => {
  it("offers Default first, then the backend's models in its order, each under its group, with its note", () => {
    expect(modelOptions(settings(null))).toEqual([
      { value: "", label: "Default" },
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
      [null, ["Default"]],
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
      { value: "", label: "Default" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "Extra high" },
      { value: "max", label: "Max" },
    ]);
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
      { value: "", label: "Default" },
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
