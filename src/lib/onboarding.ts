// Getting started: the welcome flow after the first sign-in, and the checklist in the app after it.
// Whether each step is done is worked out from what the API already says (the agent settings,
// the linked chats, the apps, the chat history, the automations); nothing here is stored.

import { appsToOffer } from "@/components/apps/apps-logic";
import { PROVIDER_LABEL } from "@/components/settings/agent-summary";
import type { AgentSettings, App, Automation, ChannelLink, ChannelType, Conversation, Me } from "./api/client";
import { linkableChannels, type LinkableChannel } from "./channels";
import { chatDraftHref } from "./chat-link";
import { isAutomationsChat, NEW_CHAT_TITLE } from "./conversations";
import { CHANNEL_LABEL, listNames } from "./format";

/** What the API says that the steps are worked out from. */
export type SetupData = {
  settings: Pick<AgentSettings, "aiAccess" | "platformAvailable" | "ownKeyProviders" | "claude">;
  /** `GET /v1/channels`: the linked chats and the channels switched on. */
  channels: { items: readonly ChannelLink[]; available: readonly ChannelType[] };
  apps: readonly App[];
  /** The chat history (`kind=chat`), as far as it is loaded. */
  conversations: readonly Conversation[];
  automations: readonly Automation[];
};

// ---------------------------------------------------------------- the facts

/** Tex has an AI to think with: the person's own, or Textcrew AI. Without one it can't answer. */
export function aiConnected(settings: SetupData["settings"]): boolean {
  return settings.aiAccess !== "none";
}

/** What Tex thinks with, in a few words, or null when it has nothing. */
export function aiSource(settings: SetupData["settings"]): string | null {
  switch (settings.aiAccess) {
    case "claude_plan":
      return "your Claude plan";
    case "own_key": {
      const provider = settings.ownKeyProviders[0];
      return provider ? `your ${PROVIDER_LABEL[provider]} key` : "your own API key";
    }
    case "platform":
      return "Textcrew AI, paid in credits";
    default:
      return null;
  }
}

/** The chat apps that can be linked here, and the chats already linked (the web chat is neither). */
export function chatOffer(channels: SetupData["channels"]): { linkable: LinkableChannel[]; linked: ChannelLink[] } {
  return {
    linkable: linkableChannels([...channels.available]),
    linked: channels.items.filter((link) => link.channel !== "web"),
  };
}

/** "Telegram" when it is the one chat app on offer, "a chat app" when there are several. */
export function chatAppName(linkable: readonly LinkableChannel[]): string {
  return linkable.length === 1 ? CHANNEL_LABEL[linkable[0]] : "a chat app";
}

const isConnected = (app: App) => app.connections.some((connection) => connection.status === "active");

/** The apps with a working connection, and the first few that could be connected now. */
export function appOffer(apps: readonly App[]): { connected: App[]; offered: App[] } {
  return { connected: apps.filter(isConnected), offered: appsToOffer(apps.filter((app) => !isConnected(app)), 3) };
}

/**
 * Whether the person has ever said something to Tex. A conversation has its title from the first
 * thing said in it (or one the person gave it); one with nothing in it is "New chat", and its
 * `lastMessageAt` is still its `startedAt`. The Automations chat doesn't count: runs speak there.
 */
export function hasSpoken(conversations: readonly Conversation[]): boolean {
  return conversations.some(
    (conversation) =>
      !isAutomationsChat(conversation) &&
      ((conversation.title.trim() !== "" && conversation.title.trim() !== NEW_CHAT_TITLE) ||
        Date.parse(conversation.lastMessageAt) > Date.parse(conversation.startedAt)),
  );
}

// ---------------------------------------------------------------- a first message

const GENERAL_ASKS = [
  "Remind me tomorrow at 9am to plan my week.",
  "Research what other tools like mine charge, with links.",
  "Every Monday at 9am, give me a summary of my week.",
] as const;

/**
 * Something to say first, with a few more to pick from. The first one fits the apps that are
 * connected, so Tex's first answer shows it working where the person's work is.
 */
export function firstMessages(apps: readonly App[]): string[] {
  const on = new Set(apps.filter(isConnected).map((app) => app.slug));
  const first =
    on.has("gmail") && on.has("googlecalendar")
      ? "How does my day look? Check my calendar and my inbox."
      : on.has("gmail")
        ? "What’s in my inbox today? Tell me what needs an answer."
        : on.has("googlecalendar")
          ? "How does my day look?"
          : on.has("github")
            ? "List my open pull requests and tell me which need attention."
            : on.has("notion")
              ? "Find my notes from last week and sum them up."
              : "Hi Tex! What can you and the crew do for me?";
  return [first, ...GENERAL_ASKS];
}

// ---------------------------------------------------------------- the checklist

export type ChecklistId = "ai" | "app" | "message" | "chat" | "automation";

export type ChecklistItem = {
  id: ChecklistId;
  title: string;
  /** What it is for, in plain words, while it isn't done. */
  body: string;
  done: boolean;
  /** Worth doing, but the checklist is finished without it. */
  optional: boolean;
  /** Said once it is done: what was set up. */
  doneNote: string;
  /** Where it is done, and the word on the button. */
  href: string;
  action: string;
};

/** The path of one step of the welcome flow, which comes back to `returnTo` when that step is done. */
export function stepHref(step: StepId, returnTo = "/"): string {
  return returnTo === "/" ? `/onboarding?step=${step}` : `/onboarding?step=${step}&return=${encodeURIComponent(returnTo)}`;
}

function countNoun(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The checklist, most important first: the AI (Tex can't answer without one), an app, a first
 * message, then the optional ones, a chat app and an automation. A chat app or an app is left out
 * when none can be linked or connected here and none is.
 */
export function checklistItems(data: SetupData): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const ai = aiSource(data.settings);
  items.push({
    id: "ai",
    title: "Connect your AI",
    body: data.settings.platformAvailable
      ? "Tex thinks with an AI: your Claude plan, or Textcrew AI paid in credits."
      : "Tex needs an AI to think with before it can answer. Connect your Claude plan.",
    done: ai !== null,
    optional: false,
    doneNote: ai ? `Tex runs on ${ai}` : "",
    href: stepHref("ai"),
    action: "Connect",
  });

  const apps = appOffer(data.apps);
  if (apps.connected.length > 0 || apps.offered.length > 0) {
    const names = apps.connected.map((app) => app.name);
    items.push({
      id: "app",
      title: "Connect an app",
      body: `So Tex can work where your work is: ${listNames(apps.offered.map((app) => app.name))}.`,
      done: apps.connected.length > 0,
      optional: false,
      doneNote: names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : `${listNames(names, "and")} connected`,
      href: "/apps",
      action: "Connect",
    });
  }

  items.push({
    id: "message",
    title: "Send Tex a first message",
    body: "Ask in plain words, the way you’d ask a person.",
    done: hasSpoken(data.conversations),
    optional: false,
    doneNote: "You’ve said hi",
    href: chatDraftHref(firstMessages(data.apps)[0]),
    action: "Write",
  });

  const chat = chatOffer(data.channels);
  if (chat.linkable.length > 0 || chat.linked.length > 0) {
    const linked = chat.linked[0];
    items.push({
      id: "chat",
      title: `Link ${chatAppName(chat.linkable)}`,
      body: "Text Tex from your phone, in the chat app you already use.",
      done: linked !== undefined,
      optional: true,
      doneNote: linked ? `${CHANNEL_LABEL[linked.channel]} linked as ${linked.displayId}` : "",
      href: stepHref("chat"),
      action: "Link",
    });
  }

  items.push({
    id: "automation",
    title: "Try an automation",
    body: "A reminder, a morning summary, or “tell me when…”. Tex runs it on its own.",
    done: data.automations.length > 0,
    optional: true,
    doneNote: `${countNoun(data.automations.length, "automation")} set up`,
    href: "/automations",
    action: "Try",
  });
  return items;
}

/** Everything that matters is done: the optional ones don't keep the checklist open. */
export function checklistFinished(items: readonly ChecklistItem[]): boolean {
  return items.every((item) => item.optional || item.done);
}

export function checklistProgress(items: readonly ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((item) => item.done).length, total: items.length };
}

/**
 * Whether the checklist shows: while the person hasn't hidden it (`gettingStartedDismissedAt` is
 * null on the account), once what it needs has loaded (`items`), until everything that matters is
 * done. A backend that doesn't send the field (undefined) can't keep it hidden, so it never shows.
 */
export function showChecklist(items: readonly ChecklistItem[] | null, me: Pick<Me, "gettingStartedDismissedAt"> | undefined): boolean {
  return checklistAllowed(me) && items !== null && !checklistFinished(items);
}

/** The account says the checklist may show: it was never hidden, or shown again from Settings. */
export function checklistAllowed(me: Pick<Me, "gettingStartedDismissedAt"> | undefined): boolean {
  return me?.gettingStartedDismissedAt === null;
}

// ---------------------------------------------------------------- the welcome flow

export type StepId = "welcome" | "ai" | "chat" | "apps" | "hi";

const STEP_IDS: readonly StepId[] = ["welcome", "ai", "chat", "apps", "hi"];

/**
 * The steps of the welcome flow. Linking a chat app and connecting apps are left out when there is
 * nothing to link or connect here, once that is known; until then they are in.
 */
export function welcomeSteps(data: { channels?: SetupData["channels"]; apps?: readonly App[] }): StepId[] {
  const chat = data.channels ? chatOffer(data.channels) : null;
  const apps = data.apps ? appOffer(data.apps) : null;
  return STEP_IDS.filter((step) => {
    if (step === "chat") return !chat || chat.linkable.length > 0 || chat.linked.length > 0;
    if (step === "apps") return !apps || apps.offered.length > 0 || apps.connected.length > 0;
    return true;
  });
}

/** A step's name in the row of steps at the top. */
export function stepLabel(step: StepId, linkable: readonly LinkableChannel[] = []): string {
  switch (step) {
    case "welcome":
      return "Meet the crew";
    case "ai":
      return "Your AI";
    case "chat":
      return linkable.length === 1 ? CHANNEL_LABEL[linkable[0]] : "Chat app";
    case "apps":
      return "Apps";
    case "hi":
      return "Say hi";
  }
}

/**
 * Where to go when the flow is left: a page of this app given as `?return=`, or the chat. Nothing
 * outside the app, and never the flow itself.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw === "/onboarding" || raw.startsWith("/onboarding?") || raw.startsWith("/onboarding/")) return "/";
  return raw;
}

/**
 * What the address asks of the flow: a step to open (`?step=`; the older `?channel=telegram` from
 * Settings opens the chat app step), the chat app to offer first, and where to go afterwards.
 * `focused`: one step was asked for, so finishing it leads back rather than on to the next.
 */
export function readFlowParams(params: { get(name: string): string | null }): {
  step: StepId;
  focused: boolean;
  channel: string | null;
  returnTo: string;
} {
  const asked = params.get("step");
  const channel = params.get("channel");
  const step = STEP_IDS.find((id) => id === asked) ?? (channel ? "chat" : null);
  return { step: step ?? "welcome", focused: step !== null && step !== "welcome", channel, returnTo: safeReturnPath(params.get("return")) };
}

/** The step asked for, or when it isn't offered here (no chat app to link), the one that would come after it. */
export function offeredStep(steps: readonly StepId[], wanted: StepId): StepId {
  if (steps.includes(wanted)) return wanted;
  return STEP_IDS.slice(STEP_IDS.indexOf(wanted) + 1).find((id) => steps.includes(id)) ?? steps[steps.length - 1] ?? "welcome";
}

/** The step after `current` among `steps`, or null after the last. */
export function nextStep(steps: readonly StepId[], current: StepId): StepId | null {
  const index = steps.indexOf(current);
  return index === -1 ? (steps[0] ?? null) : (steps[index + 1] ?? null);
}

/**
 * What opening the chat (the home page, `/`) shows:
 * - `app`: the app, with its sidebar and the chat;
 * - `welcome`: the welcome flow, and nothing of the app before or around it;
 * - `wait`: only a spinner on the plain page, while that isn't known yet;
 * - `error`: only "That didn't load" and Try again, when the account couldn't be loaded.
 *
 * The flow comes while the account says it hasn't been finished or skipped
 * (`onboardingCompletedAt` is null), whoever the person is, new or not. When this browser
 * remembers that the signed-in account has done it (`remembered`, src/lib/onboarded-here.ts), the
 * app shows at once while the account loads, and if the account then says otherwise (the tour
 * shown again elsewhere, an admin reset), the flow comes after all. Without that note (a new
 * account, a new browser), nothing of the app shows until the account has loaded: it could be the
 * flow's turn. Not when it was left in this page's life already (its save may have failed: the app
 * is never held up for it), nor when a link asked for something (a request typed in, the
 * Automations chat; `asked` is null until the address has been read): that goes where it asked, at
 * once, and the flow comes the next time the chat is opened. A backend that doesn't send the field
 * (undefined) can't remember it, so the flow doesn't open by itself.
 */
export type HomeView = "app" | "welcome" | "wait" | "error";

export function homeView(input: {
  me: Pick<Me, "onboardingCompletedAt"> | undefined;
  /** Loading the account failed, and it isn't being tried again right now. */
  failed: boolean;
  asked: boolean | null;
  leftThisVisit: boolean;
  /** This browser remembers the signed-in account finishing or skipping the flow. */
  remembered: boolean;
}): HomeView {
  if (input.leftThisVisit || input.asked === true) return "app";
  if (input.me === undefined) return input.remembered ? "app" : input.failed ? "error" : "wait";
  if (input.me.onboardingCompletedAt !== null) return "app";
  return input.asked === null ? "wait" : "welcome";
}

let left = false;

/**
 * The welcome flow was finished or skipped in this page's life. Kept in memory only: the account
 * keeps it for good (`onboardingCompleted`), and this stops the chat sending the person back to
 * the flow should that save fail.
 */
export const welcomeLeft = {
  mark: () => {
    left = true;
  },
  get: () => left,
  /** Shown again from Settings. */
  clear: () => {
    left = false;
  },
};
