import { describe, expect, it } from "vitest";
import { choiceValue, effortLabel, effortOptions, modelOptions } from "./claude-code";

const CHOICES = {
  models: [
    { id: "claude-opus-5-5", label: "Opus 5.5" },
    { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  ],
  efforts: ["low", "medium", "high", "xhigh", "max"] as ("low" | "medium" | "high" | "xhigh" | "max")[],
};

describe("modelOptions", () => {
  it("offers Default first, then the backend's models in its order", () => {
    expect(modelOptions({ claudeModel: null, claudeEffort: null, claudeChoices: CHOICES })).toEqual([
      { value: "", label: "Default" },
      { value: "claude-opus-5-5", label: "Opus 5.5" },
      { value: "claude-sonnet-5-5", label: "Sonnet 5.5" },
    ]);
  });

  it("keeps a saved model the backend no longer offers, so the select shows what is set", () => {
    const options = modelOptions({ claudeModel: "claude-old-4", claudeEffort: null, claudeChoices: CHOICES });
    expect(options.at(-1)).toEqual({ value: "claude-old-4", label: "claude-old-4" });
    expect(modelOptions({ claudeModel: "claude-opus-5-5", claudeEffort: null, claudeChoices: CHOICES })).toHaveLength(3);
  });
});

describe("effortOptions", () => {
  it("offers Default first, then each level in words", () => {
    expect(effortOptions({ claudeModel: null, claudeEffort: "xhigh", claudeChoices: CHOICES })).toEqual([
      { value: "", label: "Default" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "Extra high" },
      { value: "max", label: "Max" },
    ]);
  });

  it("reads a level it doesn't know as the backend names it", () => {
    expect(effortLabel("turbo")).toBe("Turbo");
  });
});

describe("choiceValue", () => {
  it("sends Default as null and anything else as it is", () => {
    expect(choiceValue("")).toBeNull();
    expect(choiceValue("xhigh")).toBe("xhigh");
  });
});
