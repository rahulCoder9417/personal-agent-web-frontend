import { describe, expect, it } from "vitest";
import type { AgentSettings } from "@/lib/api/client";
import { describeAgentSettings } from "./agent-summary";

const base: AgentSettings = {
  runtime: "hermes",
  effectiveRuntime: "hermes",
  aiAccess: "own_key",
  claude: { connected: false },
  ownKeyProviders: ["anthropic"],
};

describe("describeAgentSettings", () => {
  it("names the provider whose key pays", () => {
    const summary = describeAgentSettings(base);
    expect(summary.headline).toBe("Tex runs on Hermes, with your Anthropic key");
    expect(summary.paidBy).toBe("Your Anthropic key");
    expect(summary.agent).toBe("Hermes");
  });

  it("says Claude Code runs on the Claude plan", () => {
    const summary = describeAgentSettings({
      ...base,
      runtime: "claude_code",
      effectiveRuntime: "claude_code",
      aiAccess: "claude_plan",
      claude: { connected: true },
    });
    expect(summary.agent).toBe("Claude Code");
    expect(summary.paidBy).toBe("Your Claude plan");
  });

  it("explains when nothing can run", () => {
    const summary = describeAgentSettings({ ...base, effectiveRuntime: null, aiAccess: "none", ownKeyProviders: [] });
    expect(summary.headline).toBe("Tex can’t start a job yet");
    expect(summary.hint).toBeDefined();
    expect(summary.mood).toBe("paused");
  });

  it("covers platform credits", () => {
    expect(describeAgentSettings({ ...base, aiAccess: "platform", ownKeyProviders: [] }).paidBy).toBe("Your Textcrew credits");
  });
});
