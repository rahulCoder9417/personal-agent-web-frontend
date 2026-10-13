import { describe, expect, it } from "vitest";
import type { MessageDraft } from "./api/client";
import { draftArrived, messageArrived, messageSettled, NO_DRAFTS, turnsOver, type Drafts } from "./drafts";

const draft = (text: string, rest: Partial<MessageDraft> = {}): MessageDraft => ({
  conversationId: "cnv_1",
  turnId: "evt_1",
  messageId: "msg_in",
  text,
  at: "2026-10-13T10:00:00.000Z",
  ...rest,
});
const answer = (rest: { conversationId?: string; approvalId?: string | null; direction?: "in" | "out" } = {}) => ({
  conversationId: "cnv_1",
  direction: "out" as const,
  approvalId: null,
  ...rest,
});
const shownText = (drafts: Drafts, conversationId = "cnv_1") => drafts.shown[conversationId]?.text;

const fold = (...steps: ((d: Drafts) => Drafts)[]) => steps.reduce((d, step) => step(d), NO_DRAFTS);

describe("drafts", () => {
  it("shows the latest draft of a conversation, and the working bubble again when Tex starts over", () => {
    let drafts = fold(
      (d) => draftArrived(d, draft("Let me check")),
      (d) => draftArrived(d, draft("Let me check your calendar.")),
    );
    expect(shownText(drafts)).toBe("Let me check your calendar.");
    drafts = draftArrived(drafts, draft(""));
    expect(shownText(drafts)).toBeUndefined();
    drafts = draftArrived(drafts, draft("You have two meetings"));
    expect(shownText(drafts)).toBe("You have two meetings");
  });

  it("keeps each conversation's draft to itself", () => {
    const drafts = fold(
      (d) => draftArrived(d, draft("in the first")),
      (d) => draftArrived(d, draft("in the other", { conversationId: "cnv_2", turnId: "evt_2" })),
      (d) => messageArrived(d, answer({ conversationId: "cnv_2" })),
    );
    expect(shownText(drafts)).toBe("in the first");
    expect(shownText(drafts, "cnv_2")).toBeUndefined();
  });

  it("puts the answer in the draft's place and drops a draft of that turn that comes after it", () => {
    let drafts = fold(
      (d) => draftArrived(d, draft("You have two")),
      (d) => messageArrived(d, answer()),
    );
    expect(shownText(drafts)).toBeUndefined();
    drafts = draftArrived(drafts, draft("You have two meetings."));
    expect(shownText(drafts), "a late draft of the answered turn").toBeUndefined();
    // The next turn writes again.
    drafts = draftArrived(turnsOver(drafts), draft("Sure", { turnId: "evt_2", messageId: "msg_in2" }));
    expect(shownText(drafts)).toBe("Sure");
  });

  it("drops the turn's last draft when the answer overtook it on the way, and only that one", () => {
    let drafts = messageArrived(NO_DRAFTS, answer());
    drafts = draftArrived(drafts, draft("You have two meetings."));
    expect(shownText(drafts)).toBeUndefined();
    drafts = draftArrived(drafts, draft("You have two meetings. And"));
    expect(shownText(drafts), "still the answered turn").toBeUndefined();
    drafts = draftArrived(turnsOver(drafts), draft("Next", { turnId: "evt_2" }));
    expect(shownText(drafts)).toBe("Next");
  });

  it("keeps the draft when an approval card arrives: Tex may still be writing", () => {
    const drafts = fold(
      (d) => draftArrived(d, draft("I need your OK")),
      (d) => messageArrived(d, answer({ approvalId: "ap_1" })),
      (d) => messageArrived(d, answer({ direction: "in" })),
    );
    expect(shownText(drafts)).toBe("I need your OK");
  });

  it("clears the draft when its turn ends or fails, or the agent stops", () => {
    const writing = draftArrived(NO_DRAFTS, draft("Half an ans"));
    expect(shownText(messageSettled(writing, { id: "msg_in", direction: "in", status: "failed" }))).toBeUndefined();
    expect(shownText(messageSettled(writing, { id: "msg_in", direction: "in", status: "delivered" }))).toBeUndefined();
    expect(shownText(messageSettled(writing, { id: "msg_in", direction: "in", status: "processing" }))).toBe("Half an ans");
    expect(shownText(messageSettled(writing, { id: "msg_other", direction: "in", status: "delivered" }))).toBe("Half an ans");
    expect(shownText(turnsOver(writing))).toBeUndefined();
    // A draft of the failed turn that comes after its end is not shown.
    const failed = messageSettled(writing, { id: "msg_in", direction: "in", status: "failed" });
    expect(shownText(draftArrived(failed, draft("Half an answer")))).toBeUndefined();
  });

  it("changes nothing it doesn't have to", () => {
    expect(turnsOver(NO_DRAFTS)).toBe(NO_DRAFTS);
    const drafts = draftArrived(NO_DRAFTS, draft("x"));
    expect(messageSettled(drafts, { id: "msg_in", direction: "out", status: "delivered" })).toBe(drafts);
    expect(messageArrived(drafts, answer({ direction: "in" }))).toBe(drafts);
  });
});
