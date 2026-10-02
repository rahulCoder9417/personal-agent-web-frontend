import type { AgentSettings, ByokProvider } from "@/lib/api/client";
import type { Mood } from "@/components/tex";

export const PROVIDER_LABEL: Record<ByokProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

export const PROVIDERS: ByokProvider[] = ["anthropic", "openai", "openrouter"];

export type AgentSummary = {
  /** One sentence: what runs and what pays for it. */
  headline: string;
  /** Shown under the headline when Tex can't run. */
  hint?: string;
  agent: string;
  paidBy: string;
  mood: Mood;
};

/** Puts the agent settings into the words the "Running now" card shows. */
export function describeAgentSettings(settings: AgentSettings): AgentSummary {
  if (settings.aiAccess === "none" || settings.effectiveRuntime === null) {
    return {
      headline: "Tex can’t start a job yet",
      hint: "Add an API key or connect a Claude plan to wake it.",
      agent: "Not running",
      paidBy: "Nothing yet",
      mood: "paused",
    };
  }
  if (settings.effectiveRuntime === "claude_code") {
    return {
      headline: "Tex runs on Claude Code, covered by your Claude plan",
      agent: "Claude Code",
      paidBy: "Your Claude plan",
      mood: "ready",
    };
  }
  if (settings.aiAccess === "own_key") {
    const provider = settings.ownKeyProviders[0];
    const key = provider ? `your ${PROVIDER_LABEL[provider]} key` : "your own API key";
    return {
      headline: `Tex runs on Hermes, with ${key}`,
      agent: "Hermes",
      paidBy: key.charAt(0).toUpperCase() + key.slice(1),
      mood: "ready",
    };
  }
  if (settings.aiAccess === "claude_plan") {
    // A plan is connected but Hermes was chosen: the plan only pays when Claude Code runs.
    return {
      headline: "Tex runs on Hermes",
      hint: "Your Claude plan is connected. Choose Claude Code below to run on it.",
      agent: "Hermes",
      paidBy: "Your Claude plan",
      mood: "ready",
    };
  }
  return {
    headline: "Tex runs on Hermes, paid from your credits",
    agent: "Hermes",
    paidBy: "Your Textcrew credits",
    mood: "ready",
  };
}
