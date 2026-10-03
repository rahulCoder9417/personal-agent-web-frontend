import type { AgentSettings, ByokProvider } from "@/lib/api/client";
import type { Mood } from "@/components/tex";

export const PROVIDER_LABEL: Record<ByokProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

export const PROVIDERS: ByokProvider[] = ["anthropic", "openai", "openrouter"];

// ---------------------------------------------------------------- the three ways to get AI

/** The three ways Tex can get its AI, in the order they are offered. */
export type AiChoice = "own_key" | "claude_plan" | "textcrew";

/**
 * - `in_use`: this is what Tex runs on now
 * - `ready`: set up (a key saved, a plan connected) but something else is running
 * - `not_set_up`: nothing saved or connected
 * - `standby`: Textcrew AI while the person's own AI is doing the work
 * - `unavailable`: the backend requires your own AI, so Textcrew AI can't be used
 */
export type AiChoiceState = "in_use" | "ready" | "not_set_up" | "standby" | "unavailable";

/**
 * Whether Textcrew AI can be used. The API has no field for it, so it is read from what runs:
 * - `platform` means Tex is on it;
 * - `none` means there is no AI at all, which only happens when the backend requires your own;
 * - Hermes was chosen but Claude Code is what runs: Hermes had nothing to run on, so no key and no Textcrew AI.
 * With the person's own key or plan running, the API doesn't say either way.
 */
export function textcrewAiAvailability(settings: AgentSettings): "available" | "unavailable" | "unknown" {
  if (settings.aiAccess === "platform") return "available";
  if (settings.aiAccess === "none") return "unavailable";
  if (settings.runtime === "hermes" && settings.effectiveRuntime === "claude_code") return "unavailable";
  return "unknown";
}

/** Where each of the three choices stands for this account. */
export function describeAiChoices(settings: AgentSettings): Record<AiChoice, AiChoiceState> {
  const textcrew = textcrewAiAvailability(settings);
  return {
    own_key: settings.aiAccess === "own_key" ? "in_use" : settings.ownKeyProviders.length > 0 ? "ready" : "not_set_up",
    claude_plan: settings.aiAccess === "claude_plan" ? "in_use" : settings.claude.connected ? "ready" : "not_set_up",
    textcrew: textcrew === "available" ? "in_use" : textcrew === "unavailable" ? "unavailable" : "standby",
  };
}

// ---------------------------------------------------------------- the "Running now" card

export type AgentSummary = {
  /** One sentence: what runs and what pays for it. */
  headline: string;
  /** Shown under the headline when there is something to explain. */
  hint?: string;
  agent: string;
  paidBy: string;
  /** What credits are spent on, given what pays for the AI. */
  creditsCover: string;
  mood: Mood;
};

const WITHOUT_AI = "Running time and app actions";
const WITH_AI = "Textcrew AI, running time and app actions";

/** Puts the agent settings into the words the "Running now" card shows. */
export function describeAgentSettings(settings: AgentSettings): AgentSummary {
  if (settings.aiAccess === "none" || settings.effectiveRuntime === null) {
    return {
      headline: "Tex can’t start a job yet",
      hint: "Textcrew AI isn’t available on this account. Add an API key or connect your Claude plan to wake Tex.",
      agent: "Not running",
      paidBy: "Nothing yet",
      creditsCover: WITHOUT_AI,
      mood: "paused",
    };
  }
  if (settings.effectiveRuntime === "claude_code") {
    return {
      headline: "Tex runs Claude Code, on your Claude plan",
      // Hermes was chosen, but with no key and no Textcrew AI the plan is the only AI there is.
      ...(settings.runtime === "hermes"
        ? { hint: "You chose Hermes, but it has nothing to run on: no API key is saved and Textcrew AI isn’t available." }
        : {}),
      agent: "Claude Code",
      paidBy: "Your Claude plan",
      creditsCover: WITHOUT_AI,
      mood: "ready",
    };
  }
  if (settings.aiAccess === "own_key") {
    const provider = settings.ownKeyProviders[0];
    const key = provider ? `your ${PROVIDER_LABEL[provider]} key` : "your own API key";
    return {
      headline: `Tex runs on Hermes, with ${key}`,
      ...(settings.claude.connected ? { hint: "Your Claude plan is connected. Choose Claude Code under Agent to run on it." } : {}),
      agent: "Hermes",
      paidBy: key.charAt(0).toUpperCase() + key.slice(1),
      creditsCover: WITHOUT_AI,
      mood: "ready",
    };
  }
  return {
    headline: "Tex runs on Hermes, with Textcrew AI",
    hint: settings.claude.connected
      ? "Your Claude plan is connected. Choose Claude Code under Agent to run on it."
      : "The AI is paid from your credits. Add your own key or Claude plan and it isn’t.",
    agent: "Hermes",
    paidBy: "Your credits",
    creditsCover: WITH_AI,
    mood: "ready",
  };
}
