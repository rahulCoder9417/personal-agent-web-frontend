import { describe, expect, it } from "vitest";
import { ApiError, type Message } from "./api/client";
import { newChatDividerAt, newChatError, showsNewChat, threadIsWorking, webChatIsEmpty } from "./chat-thread";

type Row = Pick<Message, "channel" | "direction" | "status">;
const inbound = (channel: Message["channel"], status: Message["status"]): Row => ({ channel, direction: "in", status });
const reply = (channel: Message["channel"]): Row => ({ channel, direction: "out", status: "sent" });

describe("threadIsWorking", () => {
  it("follows the agent's state when every chat app is shown", () => {
    const thread = [reply("telegram"), inbound("telegram", "delivered")];
    expect(threadIsWorking("all", true, thread)).toBe(true);
    expect(threadIsWorking("all", false, thread)).toBe(false);
  });

  it("shows nothing in the web chat while Tex works on a Telegram message", () => {
    // The web thread's newest message was answered long ago; the turn running is Telegram's.
    expect(threadIsWorking("web", true, [reply("web"), inbound("web", "delivered")])).toBe(false);
    expect(threadIsWorking("telegram", true, [inbound("telegram", "processing"), reply("telegram")])).toBe(true);
  });

  it("shows the bubble in the thread whose message the agent has taken, and not after the turn ends", () => {
    expect(threadIsWorking("web", true, [inbound("web", "processing"), reply("web")])).toBe(true);
    expect(threadIsWorking("web", true, [inbound("web", "delivered")])).toBe(false);
    expect(threadIsWorking("web", true, [inbound("web", "failed")])).toBe(false);
    // Not yet taken: the agent is busy with something else.
    expect(threadIsWorking("web", true, [inbound("web", "queued"), reply("web")])).toBe(false);
  });

  it("looks past messages still waiting in the queue to the one being worked on", () => {
    expect(threadIsWorking("web", true, [inbound("web", "queued"), inbound("web", "processing")])).toBe(true);
  });

  it("ignores a message left processing once the agent isn't busy, and an older one a newer turn has passed", () => {
    expect(threadIsWorking("web", false, [inbound("web", "processing")])).toBe(false);
    expect(threadIsWorking("web", true, [reply("web"), inbound("web", "delivered"), inbound("web", "processing")])).toBe(false);
  });

  it("shows nothing in a thread with no message of its own", () => {
    expect(threadIsWorking("telegram", true, [])).toBe(false);
  });
});

describe("newChatDividerAt", () => {
  const at = (hhmm: string) => ({ createdAt: `2026-10-08T${hhmm}:00.000Z` });
  const thread = [at("09:00"), at("09:05"), at("10:30"), at("10:31")];

  it("goes before the first message after the new chat started", () => {
    expect(newChatDividerAt(thread, "2026-10-08T10:00:00.000Z", true)).toBe(2);
    expect(newChatDividerAt(thread, "2026-10-08T10:00:00.000Z", false)).toBe(2);
  });

  it("goes at the end when nothing has been said since, so a fresh start shows straight away", () => {
    expect(newChatDividerAt(thread, "2026-10-08T11:00:00.000Z", false)).toBe(4);
  });

  it("waits for older messages when the start is older than everything loaded", () => {
    expect(newChatDividerAt(thread, "2026-10-08T08:00:00.000Z", false)).toBeNull();
    expect(newChatDividerAt(thread, "2026-10-08T08:00:00.000Z", true)).toBe(0);
  });

  it("draws nothing without a new chat or without messages", () => {
    expect(newChatDividerAt(thread, null, true)).toBeNull();
    expect(newChatDividerAt([], "2026-10-08T10:00:00.000Z", true)).toBeNull();
  });
});

describe("showsNewChat", () => {
  it("is drawn where the web chat is shown, not in another chat app's thread", () => {
    expect(showsNewChat("all")).toBe(true);
    expect(showsNewChat("web")).toBe(true);
    expect(showsNewChat("telegram")).toBe(false);
  });
});

describe("webChatIsEmpty", () => {
  const web = (hhmm: string) => ({ channel: "web" as const, createdAt: `2026-10-08T${hhmm}:00.000Z` });
  const telegram = (hhmm: string) => ({ channel: "telegram" as const, createdAt: `2026-10-08T${hhmm}:00.000Z` });

  it("is empty when nothing was said in the web chat since it started, whatever came on Telegram", () => {
    expect(webChatIsEmpty([telegram("10:30"), web("09:00")], "2026-10-08T10:00:00.000Z", false)).toBe(true);
    expect(webChatIsEmpty([telegram("10:30")], null, true)).toBe(true);
    expect(webChatIsEmpty([], null, true)).toBe(true);
  });

  it("is not empty once a web message follows the start", () => {
    expect(webChatIsEmpty([web("10:30"), web("09:00")], "2026-10-08T10:00:00.000Z", false)).toBe(false);
    expect(webChatIsEmpty([web("09:00")], null, true)).toBe(false);
  });

  it("counts as not empty when the messages loaded don't reach back to the start", () => {
    expect(webChatIsEmpty([telegram("10:30")], "2026-10-08T10:00:00.000Z", false)).toBe(false);
    expect(webChatIsEmpty([telegram("10:30")], null, false)).toBe(false);
  });
});

describe("newChatError", () => {
  it("says the hourly limit in words, and passes other errors on", () => {
    expect(newChatError(new ApiError(429, "rate_limited", "Too many requests"))).toContain("new chats in an hour");
    expect(newChatError(new ApiError(0, "network", "You seem to be offline."))).toBe("You seem to be offline.");
  });
});
