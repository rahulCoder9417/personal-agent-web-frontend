import { describe, expect, it } from "vitest";
import type { AgentSettings } from "@/lib/api/client";
import { chosenRuntime, choseTextcrewAi, describeAgentSettings, describeAiChoices, runtimePatch, textcrewAiOffer } from "./agent-summary";

const base: AgentSettings = {
  runtime: "hermes",
  effectiveRuntime: "hermes",
  aiAccess: "own_key",
  aiPreference: "auto",
  platformAvailable: true,
  claude: { connected: false },
  ownKeyProviders: ["anthropic"],
  claudeModel: null,
  claudeEffort: null,
  claudeChoices: { models: [{ id: "claude-opus-5-5", label: "Opus 5.5" }], efforts: ["low", "high"] },
};

const onTextcrewAi: AgentSettings = { ...base, aiAccess: "platform", ownKeyProviders: [] };
const onClaudePlan: AgentSettings = {
  ...base,
  runtime: "claude_code",
  effectiveRuntime: "claude_code",
  aiAccess: "claude_plan",
  claude: { connected: true },
};
/** Hermes chosen, no key, no Textcrew AI: the backend runs Claude Code because the plan is the only AI. */
const planIsAllThereIs: AgentSettings = { ...onClaudePlan, runtime: "hermes", ownKeyProviders: [], platformAvailable: false };
/** The backend requires your own AI, and there is none. */
const nothing: AgentSettings = { ...base, effectiveRuntime: null, aiAccess: "none", ownKeyProviders: [], platformAvailable: false };
/** A key is saved, and Textcrew AI was chosen over it. */
const choseOverKey: AgentSettings = { ...base, aiAccess: "platform", aiPreference: "platform" };
/** A Claude plan was running Claude Code, and Textcrew AI was chosen over it. */
const choseOverPlan: AgentSettings = { ...onClaudePlan, effectiveRuntime: "hermes", aiAccess: "platform", aiPreference: "platform", ownKeyProviders: [] };

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

  it("says so when Textcrew AI was chosen over your own AI", () => {
    const summary = describeAgentSettings(choseOverKey);
    expect(summary.headline).toBe("Tex runs on Hermes, with Textcrew AI");
    expect(summary.paidBy).toBe("Your credits");
    expect(summary.hint).toContain("You chose Textcrew AI over your own AI");
    expect(describeAgentSettings(choseOverPlan).agent).toBe("Hermes");
  });
});

describe("describeAiChoices", () => {
  it("marks the one in use, and Textcrew AI as ready while your own AI runs", () => {
    expect(describeAiChoices(base)).toEqual({ own_key: "in_use", claude_plan: "not_set_up", textcrew: "ready" });
    expect(describeAiChoices(onTextcrewAi)).toEqual({ own_key: "not_set_up", claude_plan: "not_set_up", textcrew: "in_use" });
  });

  it("shows a saved key as ready while the Claude plan runs", () => {
    expect(describeAiChoices({ ...onClaudePlan, ownKeyProviders: ["openai"] })).toEqual({
      own_key: "ready",
      claude_plan: "in_use",
      textcrew: "ready",
    });
  });

  it("shows a connected plan as ready while a key runs Hermes", () => {
    expect(describeAiChoices({ ...base, claude: { connected: true } }).claude_plan).toBe("ready");
  });

  it("shows what was set up as ready once Textcrew AI is chosen over it", () => {
    expect(describeAiChoices(choseOverKey)).toEqual({ own_key: "ready", claude_plan: "not_set_up", textcrew: "in_use" });
    expect(describeAiChoices(choseOverPlan)).toEqual({ own_key: "not_set_up", claude_plan: "ready", textcrew: "in_use" });
  });

  it("goes by platformAvailable, not by what happens to be running", () => {
    expect(describeAiChoices(nothing)).toEqual({ own_key: "not_set_up", claude_plan: "not_set_up", textcrew: "unavailable" });
    expect(describeAiChoices(planIsAllThereIs).textcrew).toBe("unavailable");
    expect(describeAiChoices({ ...base, platformAvailable: false }).textcrew).toBe("unavailable");
    // A preference saved before Textcrew AI went off offer counts for nothing.
    expect(describeAiChoices({ ...base, platformAvailable: false, aiPreference: "platform" }).textcrew).toBe("unavailable");
  });
});

describe("textcrewAiOffer", () => {
  it("offers Textcrew AI to someone running on their own key or plan", () => {
    expect(textcrewAiOffer(base)).toEqual({ action: "choose", patch: { aiPreference: "platform" } });
    expect(textcrewAiOffer(onClaudePlan)).toEqual({ action: "choose", patch: { aiPreference: "platform" } });
  });

  it("offers the way back to the AI that was set up", () => {
    expect(textcrewAiOffer(choseOverKey)).toEqual({
      action: "go_back",
      patch: { runtime: "hermes", aiPreference: "auto" },
      to: "your Anthropic key",
    });
    expect(textcrewAiOffer(choseOverPlan)).toEqual({
      action: "go_back",
      patch: { runtime: "claude_code", aiPreference: "auto" },
      to: "your Claude plan",
    });
    // Both set up, Hermes was the agent: back to the key. Claude Code was the agent: back to the plan.
    expect(textcrewAiOffer({ ...choseOverKey, claude: { connected: true } })).toMatchObject({ to: "your Anthropic key" });
    expect(textcrewAiOffer({ ...choseOverPlan, ownKeyProviders: ["openai"] })).toMatchObject({ to: "your Claude plan" });
    // A plan is connected with Hermes chosen and no key: the plan is the only AI to go back to.
    expect(textcrewAiOffer({ ...choseOverPlan, runtime: "hermes" })).toMatchObject({ to: "your Claude plan", patch: { runtime: "claude_code" } });
  });

  it("offers nothing when Textcrew AI is all there is, or isn't on offer", () => {
    expect(textcrewAiOffer(onTextcrewAi)).toBeNull();
    expect(textcrewAiOffer({ ...onTextcrewAi, aiPreference: "platform" })).toBeNull();
    expect(textcrewAiOffer(nothing)).toBeNull();
    expect(textcrewAiOffer({ ...base, platformAvailable: false })).toBeNull();
  });
});

describe("choosing an agent", () => {
  it("shows Hermes as chosen while Textcrew AI is picked over a Claude plan", () => {
    expect(choseTextcrewAi(choseOverPlan)).toBe(true);
    expect(chosenRuntime(choseOverPlan)).toBe("hermes");
    expect(chosenRuntime(onClaudePlan)).toBe("claude_code");
    expect(chosenRuntime(planIsAllThereIs)).toBe("hermes");
  });

  it("drops the Textcrew AI choice when Claude Code is picked", () => {
    expect(runtimePatch("claude_code")).toEqual({ runtime: "claude_code", aiPreference: "auto" });
    expect(runtimePatch("hermes")).toEqual({ runtime: "hermes" });
  });
});
