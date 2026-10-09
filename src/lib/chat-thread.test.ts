import { describe, expect, it } from "vitest";
import type { Message } from "./api/client";
import { threadIsWorking } from "./chat-thread";

type Row = Pick<Message, "direction" | "status">;
const inbound = (status: Message["status"]): Row => ({ direction: "in", status });
const reply = (): Row => ({ direction: "out", status: "sent" });

// Each list is one conversation's thread, newest first.
describe("threadIsWorking", () => {
  it("shows the bubble in the conversation whose message the agent has taken, and not after the turn ends", () => {
    expect(threadIsWorking(true, [inbound("processing"), reply()])).toBe(true);
    expect(threadIsWorking(true, [inbound("delivered")])).toBe(false);
    expect(threadIsWorking(true, [inbound("failed")])).toBe(false);
    // Not yet taken: the agent is busy with something else.
    expect(threadIsWorking(true, [inbound("queued"), reply()])).toBe(false);
  });

  it("shows nothing in a conversation that was answered long ago while Tex works in another one", () => {
    expect(threadIsWorking(true, [reply(), inbound("delivered")])).toBe(false);
    expect(threadIsWorking(true, [reply(), inbound("read")])).toBe(false);
  });

  it("looks past messages still waiting in the queue to the one being worked on", () => {
    expect(threadIsWorking(true, [inbound("queued"), inbound("processing")])).toBe(true);
  });

  it("ignores a message left processing once the agent isn't busy, and an older one a newer turn has passed", () => {
    expect(threadIsWorking(false, [inbound("processing")])).toBe(false);
    expect(threadIsWorking(true, [reply(), inbound("delivered"), inbound("processing")])).toBe(false);
  });

  it("shows nothing in a conversation with no message of the person's", () => {
    expect(threadIsWorking(true, [])).toBe(false);
    expect(threadIsWorking(true, [reply()])).toBe(false);
  });
});
