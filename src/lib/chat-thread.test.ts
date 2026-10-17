import { describe, expect, it } from "vitest";
import type { Message } from "./api/client";
import { localMessage } from "./api/hooks";
import { ANSWER_TURN_MAX_MS, inboundStatusWord, QUEUED_WORKING_MS, threadActivity, threadIsWorking, waitingForTexUntil } from "./chat-thread";

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

describe("Tex at work from the moment a message is sent", () => {
  // 17 October, 05:20:07: the founder sends; the api saves the message (about 0.8 s); the agent
  // takes it 1.5 s after it was queued (`processing`, `busy`); the answer comes at 17 s.
  type Item = Pick<Message, "direction" | "status" | "approvalId" | "createdAt">;
  const SENT = Date.parse("2026-10-17T05:20:06.500Z");
  const sentMessage = (status: Message["status"], createdAt = new Date(SENT).toISOString()): Item => ({ direction: "in", status, approvalId: null, createdAt });
  const tex = (): Item => ({ direction: "out", status: "sent", approvalId: null, createdAt: new Date(SENT + 17_000).toISOString() });
  const earlier: Item = { direction: "in", status: "delivered", approvalId: null, createdAt: "2026-10-17T05:17:01.000Z" };
  const awake = { state: "awake" as const, lastActiveAt: "2026-10-17T05:18:27.000Z" };
  const busy = { state: "busy" as const, lastActiveAt: "2026-10-17T05:20:09.000Z" };
  const activity = (status: Parameters<typeof threadActivity>[0]["status"], messages: Item[], seconds: number) =>
    threadActivity({ status, messages, approval: undefined, answeredHere: false, now: SENT + seconds * 1000 });

  it("shows at once, while the message is sent and saved, before the agent says anything", () => {
    // Before: nothing until the agent took it (2.5 s here, 5 to 7 s when the container had to wake).
    expect(activity(awake, [sentMessage("queued"), earlier], 0)).toBe("working");
    expect(activity(awake, [sentMessage("queued"), earlier], 2)).toBe("working");
    // Asleep, or no state known yet: the same.
    expect(activity({ state: "stopped", lastActiveAt: null }, [sentMessage("queued")], 1)).toBe("working");
    expect(activity(undefined, [sentMessage("queued")], 1)).toBe("working");
    // The container waking for it.
    expect(activity({ state: "waking", lastActiveAt: null }, [sentMessage("queued")], 3)).toBe("working");
  });

  it("hands over to the agent's own word, and ends with the turn", () => {
    expect(activity(busy, [sentMessage("processing"), earlier], 3)).toBe("working");
    expect(activity(busy, [tex(), sentMessage("processing")], 17)).toBe("working");
    expect(activity(awake, [tex(), sentMessage("delivered")], 18)).toBeNull();
    expect(activity(awake, [sentMessage("failed")], 18)).toBeNull();
  });

  it("covers a message answered without the agent: a quick reply, no credits", () => {
    expect(activity(awake, [tex(), sentMessage("queued")], 2)).toBe("working");
    expect(activity(awake, [tex(), sentMessage("delivered")], 2)).toBeNull();
  });

  it("stops after a while for a message whose turn never ran, unless the agent is at work before it", () => {
    const limit = QUEUED_WORKING_MS / 1000;
    expect(activity(awake, [sentMessage("queued")], limit - 1)).toBe("working");
    expect(activity(awake, [sentMessage("queued")], limit)).toBeNull();
    // Waiting behind a turn that is running: as long as a turn can last.
    expect(activity(busy, [sentMessage("queued")], limit + 60)).toBe("working");
    expect(activity(busy, [sentMessage("queued")], ANSWER_TURN_MAX_MS / 1000)).toBeNull();
    // A message from yesterday still marked queued shows nothing.
    expect(activity(awake, [sentMessage("queued", "2026-10-16T05:20:06.500Z")], 0)).toBeNull();
  });

  it("says until when, for the thread to be drawn again then", () => {
    expect(waitingForTexUntil("awake", [sentMessage("queued")])).toBe(SENT + QUEUED_WORKING_MS);
    expect(waitingForTexUntil("busy", [sentMessage("queued")])).toBe(SENT + ANSWER_TURN_MAX_MS);
    expect(waitingForTexUntil("awake", [sentMessage("processing")])).toBeNull();
    expect(waitingForTexUntil("awake", [tex()])).toBeNull();
    // A message without its time (an older caller) is left to the agent's state.
    expect(waitingForTexUntil("awake", [{ direction: "in", status: "queued" }])).toBeNull();
  });

  it("only for the newest message of the person's in this thread", () => {
    // The newest one has been answered; an older one left queued doesn't count.
    expect(activity(awake, [tex(), sentMessage("delivered"), sentMessage("queued")], 5)).toBeNull();
  });
});

describe("the words under a message of the person's", () => {
  it("says sending only while it is on its way, sent once the API has it", () => {
    const local = localMessage({ clientMessageId: "4b0e8f0a-2a43-4c1f-9d55-0e7f1c1b9a01", conversationId: "cnv_1", text: "hi" });
    expect(inboundStatusWord(local)).toBe("sending");
    expect(inboundStatusWord({ id: "msg_1", status: "queued" })).toBe("sent");
    expect(inboundStatusWord({ id: "msg_1", status: "processing" })).toBe("Tex is on it");
    expect(inboundStatusWord({ id: "msg_1", status: "delivered" })).toBe("delivered");
    expect(inboundStatusWord({ id: "msg_1", status: "read" })).toBe("read");
    expect(inboundStatusWord({ id: "msg_1", status: "failed" })).toBe("not sent");
    expect(inboundStatusWord({ id: "msg_1", status: "sent" })).toBeUndefined();
  });
});
