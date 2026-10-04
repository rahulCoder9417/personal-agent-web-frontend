import type { AgentRuntime, AgentSettings, AiPreference, ByokProvider } from "@/lib/api/client";
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
 * - `ready`: Tex could run on it (a key saved, a plan connected, Textcrew AI on offer) but something else is running
 * - `not_set_up`: nothing saved or connected
 * - `unavailable`: Textcrew AI isn't on offer (`platformAvailable: false`)
 */
export type AiChoiceState = "in_use" | "ready" | "not_set_up" | "unavailable";

/** Where each of the three choices stands for this account. */
export function describeAiChoices(settings: AgentSettings): Record<AiChoice, AiChoiceState> {
  return {
    own_key: settings.aiAccess === "own_key" ? "in_use" : settings.ownKeyProviders.length > 0 ? "ready" : "not_set_up",
    claude_plan: settings.aiAccess === "claude_plan" ? "in_use" : settings.claude.connected ? "ready" : "not_set_up",
    textcrew: !settings.platformAvailable ? "unavailable" : settings.aiAccess === "platform" ? "in_use" : "ready",
  };
}

/** A key is saved or a Claude plan is connected, whatever Tex runs on right now. */
export function hasOwnAi(settings: AgentSettings): boolean {
  return settings.ownKeyProviders.length > 0 || settings.claude.connected;
}

/** Textcrew AI was picked over the person's own AI. The preference counts for nothing while it isn't on offer. */
export function choseTextcrewAi(settings: AgentSettings): boolean {
  return settings.platformAvailable && settings.aiPreference === "platform" && hasOwnAi(settings);
}

/** The agent to show as chosen: with Textcrew AI picked, Hermes runs whatever was chosen before. */
export function chosenRuntime(settings: AgentSettings): AgentRuntime {
  return choseTextcrewAi(settings) ? "hermes" : settings.runtime;
}

/** What `PATCH /v1/agent/settings` takes: the agent, the AI preference, or both. */
export type AgentSettingsPatch = { runtime?: AgentRuntime; aiPreference?: AiPreference };

/** Choosing an agent. Claude Code means the Claude plan, so an earlier choice of Textcrew AI is dropped with it. */
export function runtimePatch(runtime: AgentRuntime): AgentSettingsPatch {
  return runtime === "claude_code" ? { runtime, aiPreference: "auto" } : { runtime };
}

/**
 * What the Textcrew AI card offers:
 * - `choose`: Tex is on the person's own AI and Textcrew AI is on offer
 * - `go_back`: they chose Textcrew AI over their own AI; `to` names that AI and `patch` returns to it
 * - nothing: it isn't on offer, or it is all Tex has
 */
export type TextcrewAiOffer = { action: "choose"; patch: AgentSettingsPatch } | { action: "go_back"; patch: AgentSettingsPatch; to: string } | null;

export function textcrewAiOffer(settings: AgentSettings): TextcrewAiOffer {
  if (!settings.platformAvailable) return null;
  if (settings.aiAccess !== "platform") return { action: "choose", patch: { aiPreference: "platform" } };
  if (!choseTextcrewAi(settings)) return null;

  const provider = settings.ownKeyProviders[0];
  // The plan, when that is what ran before or it is the only AI they have; otherwise their key.
  if (settings.claude.connected && (settings.runtime === "claude_code" || !provider)) {
    return { action: "go_back", patch: { runtime: "claude_code", aiPreference: "auto" }, to: "your Claude plan" };
  }
  return { action: "go_back", patch: { runtime: "hermes", aiPreference: "auto" }, to: `your ${PROVIDER_LABEL[provider]} key` };
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
    hint: choseTextcrewAi(settings)
      ? "You chose Textcrew AI over your own AI, so the AI is paid from your credits. What you set up stays saved."
      : settings.claude.connected
        ? "Your Claude plan is connected. Choose Claude Code under Agent to run on it."
        : "The AI is paid from your credits. Add your own key or Claude plan and it isn’t.",
    agent: "Hermes",
    paidBy: "Your credits",
    creditsCover: WITH_AI,
    mood: "ready",
  };
}
