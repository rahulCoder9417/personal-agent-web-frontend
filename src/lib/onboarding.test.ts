import { describe, expect, it } from "vitest";
import type { App, Automation, ChannelLink, Conversation } from "./api/client";
import {
  aiSource,
  checklistAllowed,
  checklistFinished,
  checklistItems,
  checklistProgress,
  firstMessages,
  hasSpoken,
  nextStep,
  offeredStep,
  readFlowParams,
  safeReturnPath,
  type SetupData,
  shouldOpenWelcome,
  showChecklist,
  stepHref,
  stepLabel,
  welcomeLeft,
  welcomeSteps,
} from "./onboarding";

const T0 = "2026-10-15T09:00:00.000Z";
const T1 = "2026-10-15T09:05:00.000Z";

function app(slug: string, name: string, extra: Partial<App> = {}): App {
  return {
    slug,
    name,
    provider: "Google",
    description: "",
    iconUrl: null,
    category: "email",
    availableOnPlan: true,
    connectable: true,
    connections: [],
    ...extra,
  };
}

const connected = (a: App, label = "me@example.com"): App => ({ ...a, connections: [{ id: `con_${a.slug}`, accountLabel: label, status: "active" }] });

function conversation(extra: Partial<Conversation> = {}): Conversation {
  return { id: "cnv_1", channel: "web", kind: "chat", epoch: 1, startedAt: T0, lastMessageAt: T0, title: "New chat", active: true, ...extra };
}

const telegram: ChannelLink = { id: "ch_1", channel: "telegram", displayId: "@meera", linkedAt: T1 };

const automation = { id: "aut_1" } as Automation;

/** A brand-new account on a server with Textcrew AI off, as the beta runs. */
function fresh(extra: Partial<SetupData> = {}): SetupData {
  return {
    settings: { aiAccess: "none", platformAvailable: false, ownKeyProviders: [], claude: { connected: false } },
    channels: { items: [], available: ["telegram", "web"] },
    apps: [app("gmail", "Gmail"), app("github", "GitHub"), app("hubspot", "HubSpot", { connectable: false }), app("notion", "Notion")],
    conversations: [],
    automations: [],
    ...extra,
  };
}

/** The same account with everything done. */
function done(): SetupData {
  return fresh({
    settings: { aiAccess: "claude_plan", platformAvailable: false, ownKeyProviders: [], claude: { connected: true } },
    channels: { items: [telegram], available: ["telegram", "web"] },
    apps: [connected(app("gmail", "Gmail")), app("github", "GitHub")],
    conversations: [conversation({ title: "Summarise my unread email", lastMessageAt: T1 })],
    automations: [automation],
  });
}

const byId = (data: SetupData) => Object.fromEntries(checklistItems(data).map((item) => [item.id, item]));

describe("the checklist's steps", () => {
  it("lists the AI first, then an app and a first message, then the optional chat app and automation", () => {
    const items = checklistItems(fresh());
    expect(items.map((item) => item.id)).toEqual(["ai", "app", "message", "chat", "automation"]);
    expect(items.filter((item) => item.optional).map((item) => item.id)).toEqual(["chat", "automation"]);
    expect(items.every((item) => !item.done)).toBe(true);
  });

  it("counts the AI as connected for a Claude plan, a key, or Textcrew AI, and says which", () => {
    expect(byId(fresh()).ai.done).toBe(false);
    const plan = byId(fresh({ settings: { aiAccess: "claude_plan", platformAvailable: false, ownKeyProviders: [], claude: { connected: true } } })).ai;
    expect(plan).toMatchObject({ done: true, doneNote: "Tex runs on your Claude plan" });
    const key = byId(fresh({ settings: { aiAccess: "own_key", platformAvailable: false, ownKeyProviders: ["openai"], claude: { connected: false } } })).ai;
    expect(key.doneNote).toBe("Tex runs on your OpenAI key");
    // With Textcrew AI on offer, a new account already works: it runs on credits.
    const platform = byId(fresh({ settings: { aiAccess: "platform", platformAvailable: true, ownKeyProviders: [], claude: { connected: false } } })).ai;
    expect(platform).toMatchObject({ done: true, doneNote: "Tex runs on Textcrew AI, paid in credits" });
  });

  it("says the AI is needed when Textcrew AI isn't on offer, and leads to the welcome flow's AI step", () => {
    const ai = byId(fresh()).ai;
    expect(ai.body).toMatch(/needs an AI/);
    expect(ai.href).toBe("/onboarding?step=ai");
  });

  it("names the apps that can be connected, leaving out the ones that can't", () => {
    const item = byId(fresh()).app;
    expect(item.body).toContain("Gmail, GitHub or Notion");
    expect(item.body).not.toContain("HubSpot");
    expect(item.href).toBe("/apps");
  });

  it("counts an app as connected only with a working connection", () => {
    const expired: App = { ...app("gmail", "Gmail"), connections: [{ id: "c", accountLabel: null, status: "expired" }] };
    expect(byId(fresh({ apps: [expired, app("github", "GitHub")] })).app.done).toBe(false);
    const two = byId(fresh({ apps: [connected(app("gmail", "Gmail")), connected(app("github", "GitHub"))] })).app;
    expect(two).toMatchObject({ done: true, doneNote: "Gmail and GitHub connected" });
    const four = byId(fresh({ apps: ["a", "b", "c", "d"].map((slug) => connected(app(slug, slug.toUpperCase()))) })).app;
    expect(four.doneNote).toBe("A, B and 2 more");
  });

  it("leaves the app step out when nothing can be connected here and nothing is", () => {
    const none = fresh({ apps: [app("hubspot", "HubSpot", { connectable: false }), app("gmail", "Gmail", { availableOnPlan: false })] });
    expect(checklistItems(none).map((item) => item.id)).not.toContain("app");
  });

  it("leaves the chat app step out when no chat app can be linked, unless one already is", () => {
    expect(checklistItems(fresh({ channels: { items: [], available: ["web"] } })).map((item) => item.id)).not.toContain("chat");
    const switchedOff = byId(fresh({ channels: { items: [telegram], available: ["web"] } })).chat;
    expect(switchedOff).toMatchObject({ done: true, doneNote: "Telegram linked as @meera" });
  });

  it("names Telegram when it is the one chat app, and a chat app when there are several", () => {
    expect(byId(fresh()).chat.title).toBe("Link Telegram");
    expect(byId(fresh({ channels: { items: [], available: ["telegram", "whatsapp", "web"] } })).chat.title).toBe("Link a chat app");
  });

  it("counts a first message once a conversation has something said in it", () => {
    expect(byId(fresh({ conversations: [conversation()] })).message.done).toBe(false);
    expect(byId(fresh({ conversations: [conversation({ title: "What can you do?" })] })).message.done).toBe(true);
    // A file sent on its own gives no title, but the conversation has moved on.
    expect(byId(fresh({ conversations: [conversation({ lastMessageAt: T1 })] })).message.done).toBe(true);
  });

  it("opens the chat with a first message typed in, fitted to the connected apps", () => {
    expect(byId(fresh()).message.href).toBe(`/?draft=${encodeURIComponent("Hi Tex! What can you and the crew do for me?")}`);
    const gmail = byId(fresh({ apps: [connected(app("gmail", "Gmail"))] })).message.href;
    expect(decodeURIComponent(gmail)).toContain("What’s in my inbox today?");
  });

  it("counts an automation once there is one", () => {
    expect(byId(fresh({ automations: [automation, automation] })).automation).toMatchObject({ done: true, doneNote: "2 automations set up" });
  });

  it("is finished when the AI, an app and a first message are done, whatever the optional ones say", () => {
    const items = checklistItems(done());
    expect(checklistFinished(items)).toBe(true);
    expect(checklistProgress(items)).toEqual({ done: 5, total: 5 });

    const withoutOptional = checklistItems({ ...done(), channels: { items: [], available: ["telegram", "web"] }, automations: [] });
    expect(checklistFinished(withoutOptional)).toBe(true);
    expect(checklistProgress(withoutOptional)).toEqual({ done: 3, total: 5 });

    const noAi = checklistItems({ ...done(), settings: fresh().settings });
    expect(checklistFinished(noAi)).toBe(false);
  });

  it("is finished without an app when no app can be connected here", () => {
    const data = { ...done(), apps: [app("hubspot", "HubSpot", { connectable: false })] };
    expect(checklistFinished(checklistItems(data))).toBe(true);
  });
});

describe("when the checklist shows", () => {
  const items = checklistItems(fresh());
  const open = { gettingStartedDismissedAt: null };

  it("shows once its data has loaded, while something that matters is left", () => {
    expect(showChecklist(null, open)).toBe(false);
    expect(showChecklist(items, open)).toBe(true);
  });

  it("hides by itself once everything that matters is done, from what the API says", () => {
    expect(showChecklist(checklistItems(done()), open)).toBe(false);
  });

  it("hides once the person hid it: the account keeps when", () => {
    expect(showChecklist(items, { gettingStartedDismissedAt: T1 })).toBe(false);
    expect(checklistAllowed({ gettingStartedDismissedAt: T1 })).toBe(false);
  });

  it("doesn't show before the account has loaded, or on a backend that can't keep it hidden", () => {
    expect(showChecklist(items, undefined)).toBe(false);
    expect(showChecklist(items, {} as { gettingStartedDismissedAt: string | null })).toBe(false);
  });
});

describe("the welcome flow", () => {
  it("has five steps on a server with a chat app and apps to connect", () => {
    expect(welcomeSteps({ channels: fresh().channels, apps: fresh().apps })).toEqual(["welcome", "ai", "chat", "apps", "hi"]);
  });

  it("keeps every step until it knows, then leaves out what can't be done here", () => {
    expect(welcomeSteps({})).toEqual(["welcome", "ai", "chat", "apps", "hi"]);
    expect(welcomeSteps({ channels: { items: [], available: ["web"] }, apps: [] })).toEqual(["welcome", "ai", "hi"]);
  });

  it("names the chat app step after the one chat app on offer", () => {
    expect(stepLabel("chat", ["telegram"])).toBe("Telegram");
    expect(stepLabel("chat", ["telegram", "whatsapp"])).toBe("Chat app");
  });

  it("opens the step after one that isn't offered here", () => {
    const steps = welcomeSteps({ channels: { items: [], available: ["web"] }, apps: [] });
    expect(offeredStep(steps, "chat")).toBe("hi");
    expect(offeredStep(steps, "ai")).toBe("ai");
  });

  it("goes on to the next step, and ends after the last", () => {
    const steps = welcomeSteps({ channels: { items: [], available: ["web"] } });
    expect(nextStep(steps, "ai")).toBe("apps");
    expect(nextStep(steps, "hi")).toBeNull();
  });

  it("reads the step asked for, and treats it as one step to finish and go back from", () => {
    const params = (query: string) => new URLSearchParams(query);
    expect(readFlowParams(params(""))).toEqual({ step: "welcome", focused: false, channel: null, returnTo: "/" });
    expect(readFlowParams(params("step=ai"))).toMatchObject({ step: "ai", focused: true, returnTo: "/" });
    expect(readFlowParams(params("step=nope"))).toMatchObject({ step: "welcome", focused: false });
    // Settings' "Link Telegram" button, from before steps had names.
    expect(readFlowParams(params("channel=telegram&return=%2Fsettings"))).toEqual({ step: "chat", focused: true, channel: "telegram", returnTo: "/settings" });
  });

  it("only goes back to a page of this app", () => {
    expect(safeReturnPath("/settings")).toBe("/settings");
    expect(safeReturnPath("/apps?connected=gmail")).toBe("/apps?connected=gmail");
    for (const raw of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "settings", "/onboarding", "/onboarding?step=ai"]) {
      expect(safeReturnPath(raw)).toBe("/");
    }
  });

  it("builds the address of one step, with the way back when it isn't the chat", () => {
    expect(stepHref("ai")).toBe("/onboarding?step=ai");
    expect(stepHref("chat", "/settings")).toBe("/onboarding?step=chat&return=%2Fsettings");
  });
});

describe("when the welcome flow opens by itself", () => {
  const notDone = { onboardingCompletedAt: null };

  it("opens while the account says it hasn't been finished or skipped, whoever the person is", () => {
    expect(shouldOpenWelcome({ me: notDone, asked: false, leftThisVisit: false })).toBe(true);
    expect(shouldOpenWelcome({ me: { onboardingCompletedAt: T1 }, asked: false, leftThisVisit: false })).toBe(false);
  });

  it("waits for the account, and stays shut on a backend that can't remember it", () => {
    expect(shouldOpenWelcome({ me: undefined, asked: false, leftThisVisit: false })).toBe(false);
    expect(shouldOpenWelcome({ me: {} as { onboardingCompletedAt: string | null }, asked: false, leftThisVisit: false })).toBe(false);
  });

  it("doesn't get in the way of a link that asked for something", () => {
    expect(shouldOpenWelcome({ me: notDone, asked: true, leftThisVisit: false })).toBe(false);
  });

  it("doesn't send someone back once they left it, even if saving that failed", () => {
    expect(shouldOpenWelcome({ me: notDone, asked: false, leftThisVisit: true })).toBe(false);
  });

  it("remembers leaving for this page's life only, and forgets when the tour is asked for again", () => {
    welcomeLeft.clear();
    expect(welcomeLeft.get()).toBe(false);
    welcomeLeft.mark();
    expect(welcomeLeft.get()).toBe(true);
    welcomeLeft.clear();
    expect(welcomeLeft.get()).toBe(false);
  });

  it("doesn't count the Automations chat as the person speaking", () => {
    expect(hasSpoken([conversation({ kind: "automations", title: "Automations", lastMessageAt: T1 })])).toBe(false);
    expect(hasSpoken([])).toBe(false);
  });
});

describe("what to say first", () => {
  it("fits the first message to the apps, and offers a few more", () => {
    expect(firstMessages([])[0]).toBe("Hi Tex! What can you and the crew do for me?");
    expect(firstMessages([connected(app("googlecalendar", "Google Calendar"))])[0]).toBe("How does my day look?");
    expect(firstMessages([connected(app("gmail", "Gmail")), connected(app("googlecalendar", "Google Calendar"))])[0]).toMatch(/calendar and my inbox/);
    expect(firstMessages([connected(app("github", "GitHub"))])[0]).toMatch(/pull requests/);
    // An app that isn't connected doesn't count.
    expect(firstMessages([app("gmail", "Gmail")])[0]).toBe("Hi Tex! What can you and the crew do for me?");
    expect(new Set(firstMessages([])).size).toBe(4);
  });

  it("says what Tex runs on", () => {
    expect(aiSource({ aiAccess: "none", platformAvailable: false, ownKeyProviders: [], claude: { connected: false } })).toBeNull();
  });
});
