import { describe, expect, it } from "vitest";
import type { Message } from "./api/client";
import { threadIsWorking } from "./chat-thread";

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
