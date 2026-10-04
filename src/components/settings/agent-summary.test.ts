import { describe, expect, it } from "vitest";
import type { AgentSettings } from "@/lib/api/client";
import { describeAgentSettings, describeAiChoices, textcrewAiAvailability } from "./agent-summary";

const base: AgentSettings = {
  runtime: "hermes",
  effectiveRuntime: "hermes",
  aiAccess: "own_key",
  aiPreference: "auto",
  platformAvailable: true,
  claude: { connected: false },
  ownKeyProviders: ["anthropic"],
};

const onTextcrewAi: AgentSettings = { ...base, aiAccess: "platform", ownKeyProviders: [] };
const nothing: AgentSettings = { ...base, effectiveRuntime: null, aiAccess: "none", ownKeyProviders: [] };
const onClaudePlan: AgentSettings = {
  ...base,
  runtime: "claude_code",
  effectiveRuntime: "claude_code",
  aiAccess: "claude_plan",
  claude: { connected: true },
};
/** Hermes chosen, no key, no Textcrew AI: the backend runs Claude Code because the plan is the only AI. */
const planIsAllThereIs: AgentSettings = { ...onClaudePlan, runtime: "hermes", ownKeyProviders: [] };

describe("describeAgentSettings", () => {
  it("names the provider whose key pays", () => {
    const summary = describeAgentSettings(base);
    expect(summary.headline).toBe("Tex runs on Hermes, with your Anthropic key");
    expect(summary.paidBy).toBe("Your Anthropic key");
    expect(summary.agent).toBe("Hermes");
    expect(summary.creditsCover).toBe("Running time and app actions");
  });

  it("says Claude Code runs on the Claude plan", () => {
    const summary = describeAgentSettings(onClaudePlan);
    expect(summary.agent).toBe("Claude Code");
    expect(summary.paidBy).toBe("Your Claude plan");
    expect(summary.hint).toBeUndefined();
  });

  it("explains why Claude Code runs when Hermes was chosen but has no AI", () => {
    const summary = describeAgentSettings(planIsAllThereIs);
    expect(summary.agent).toBe("Claude Code");
    expect(summary.hint).toContain("Textcrew AI isn’t available");
  });

  it("explains when nothing can run, and that Textcrew AI is not on offer", () => {
    const summary = describeAgentSettings(nothing);
    expect(summary.headline).toBe("Tex can’t start a job yet");
    expect(summary.hint).toContain("Textcrew AI isn’t available");
    expect(summary.mood).toBe("paused");
  });

  it("says the AI is paid in credits on Textcrew AI", () => {
    const summary = describeAgentSettings(onTextcrewAi);
    expect(summary.headline).toBe("Tex runs on Hermes, with Textcrew AI");
    expect(summary.paidBy).toBe("Your credits");
    expect(summary.creditsCover).toBe("Textcrew AI, running time and app actions");
  });
});

describe("textcrewAiAvailability", () => {
  it("reads what the API can say, and admits what it can't", () => {
    expect(textcrewAiAvailability(onTextcrewAi)).toBe("available");
    expect(textcrewAiAvailability(nothing)).toBe("unavailable");
    expect(textcrewAiAvailability(planIsAllThereIs)).toBe("unavailable");
    expect(textcrewAiAvailability(base)).toBe("unknown");
    expect(textcrewAiAvailability(onClaudePlan)).toBe("unknown");
  });
});

describe("describeAiChoices", () => {
  it("marks the one in use", () => {
    expect(describeAiChoices(base)).toEqual({ own_key: "in_use", claude_plan: "not_set_up", textcrew: "standby" });
    expect(describeAiChoices(onTextcrewAi)).toEqual({ own_key: "not_set_up", claude_plan: "not_set_up", textcrew: "in_use" });
  });

  it("shows a saved key as ready while the Claude plan runs", () => {
    expect(describeAiChoices({ ...onClaudePlan, ownKeyProviders: ["openai"] })).toEqual({
      own_key: "ready",
      claude_plan: "in_use",
      textcrew: "standby",
    });
  });

  it("shows a connected plan as ready while a key runs Hermes", () => {
    expect(describeAiChoices({ ...base, claude: { connected: true } }).claude_plan).toBe("ready");
  });

  it("shows Textcrew AI as not available when the backend requires your own AI", () => {
    expect(describeAiChoices(nothing)).toEqual({ own_key: "not_set_up", claude_plan: "not_set_up", textcrew: "unavailable" });
    expect(describeAiChoices(planIsAllThereIs).textcrew).toBe("unavailable");
  });
});
