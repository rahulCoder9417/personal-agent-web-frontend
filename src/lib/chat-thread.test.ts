import { describe, expect, it } from "vitest";
import type { Message } from "./api/client";
import { ANSWER_TURN_MAX_MS, threadActivity, threadIsWorking } from "./chat-thread";

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

describe("threadActivity", () => {
  type Item = Pick<Message, "direction" | "status" | "approvalId">;
  const asked = (approvalId = "apr_1"): Item => ({ direction: "out", status: "sent", approvalId });
  const said = (status: Message["status"]): Item => ({ direction: "in", status, approvalId: null });
  const answer = (): Item => ({ direction: "out", status: "sent", approvalId: null });
  const DECIDED = "2026-10-15T15:56:51.000Z";
  const busy = { state: "busy" as const, lastActiveAt: "2026-10-15T15:56:56.000Z" };
  const awake = { state: "awake" as const, lastActiveAt: "2026-10-15T15:46:05.000Z" };
  const activity = (
    status: Parameters<typeof threadActivity>[0]["status"],
    messages: Item[],
    approval: Parameters<typeof threadActivity>[0]["approval"],
    answeredHere = false,
  ) => threadActivity({ status, messages, approval, answeredHere });

  it("waits for the OK, not working, once Tex has asked, while the turn winds down and after", () => {
    const thread = [asked(), said("processing")];
    expect(activity(busy, thread, { status: "pending", decidedAt: null })).toBe("waiting");
    expect(activity(awake, [asked(), said("delivered")], { status: "pending", decidedAt: null })).toBe("waiting");
  });

  it("shows Tex at work on the answer: at once when it was given here, then while the agent wakes or works", () => {
    const thread = [asked(), said("delivered")];
    const approved = { status: "approved" as const, decidedAt: DECIDED };
    const denied = { status: "rejected" as const, decidedAt: DECIDED };
    expect(activity(awake, thread, approved, true)).toBe("working");
    expect(activity(awake, thread, denied, true)).toBe("working");
    expect(activity({ state: "waking", lastActiveAt: null }, thread, approved)).toBe("working");
    expect(activity(busy, thread, denied)).toBe("working");
    // The follow-up is over (the agent is idle) and said nothing, or it was answered elsewhere long ago.
    expect(activity(awake, thread, approved)).toBeNull();
  });

  it("doesn't take a turn about something else, long after the answer, for the follow-up", () => {
    const later = { state: "busy" as const, lastActiveAt: new Date(Date.parse(DECIDED) + ANSWER_TURN_MAX_MS + 1000).toISOString() };
    expect(activity(later, [asked(), said("delivered")], { status: "approved", decidedAt: DECIDED })).toBeNull();
  });

  it("shows nothing for an expired question, or one not yet known", () => {
    expect(activity(busy, [asked()], { status: "expired", decidedAt: null })).toBeNull();
    expect(activity(busy, [asked()], undefined)).toBeNull();
  });

  it("goes back to the message rule once Tex has said something after the question", () => {
    expect(activity(busy, [answer(), asked(), said("delivered")], { status: "approved", decidedAt: DECIDED })).toBeNull();
    expect(activity(busy, [said("processing"), asked()], { status: "pending", decidedAt: null })).toBe("working");
    expect(activity(awake, [said("processing")], undefined)).toBeNull();
  });
});
