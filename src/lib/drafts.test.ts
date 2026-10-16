import { describe, expect, it } from "vitest";
import type { MessageDraft } from "./api/client";
import type { ProgressLine } from "./crew";
import {
  answerInThread,
  draftArrived,
  LOOSE_KEPT_MS,
  messageArrived,
  messageSettled,
  NO_DRAFTS,
  progressArrived,
  runRevealed,
  SHOW_AFTER_MS,
  stepLabel,
  stepLine,
  stepsToShow,
  trailLine,
  turnAnswered,
  turnOnScreen,
  turnsOver,
  turnsOverAfterReconnect,
  type Drafts,
} from "./drafts";

const T0 = 1_000_000;
const draft = (text: string, rest: Partial<MessageDraft> = {}): MessageDraft => ({
  conversationId: "cnv_1",
  turnId: "evt_1",
  messageId: "msg_in",
  text,
  at: "2026-10-13T10:00:00.000Z",
  ...rest,
});
const answer = (rest: { id?: string; conversationId?: string; approvalId?: string | null; direction?: "in" | "out" } = {}) => ({
  id: "msg_answer",
  conversationId: "cnv_1",
  direction: "out" as const,
  approvalId: null,
  ...rest,
});
const line = (text: string, who: ProgressLine["who"] = "tex"): ProgressLine => ({ who, name: who === "tex" ? "Tex" : "Scout", text, at: "2026-10-13T10:00:01.000Z" });

/** What the thread shows of a conversation's turn. */
const screen = (drafts: Drafts, conversationId = "cnv_1") => {
  const turn = turnOnScreen(drafts, conversationId);
  return turn && { writing: turn.writing, steps: turn.steps.map((step) => step.text), live: turn.live };
};
const writing = (drafts: Drafts, conversationId = "cnv_1") => turnOnScreen(drafts, conversationId)?.writing ?? null;

const LONG = "You have three meetings today: the design review at 11, a 1:1 with Dev at 4, and the dentist at 5:30.";
const LATER = "I looked at your inbox too, and two emails from Maya ask about tomorrow’s review, so here is what they want.";

describe("drafts: when a draft is worth showing", () => {
  it("holds back a short draft, and shows one of 80 characters or more, or with a line break, at once", () => {
    const short = draftArrived(NO_DRAFTS, draft("Let me check your calendar."), T0);
    expect(writing(short)).toBeNull();
    expect(writing(draftArrived(short, draft(`Let me check your calendar. ${"And then some more words that make it long enough to show"}`), T0 + 300))).toMatch(/^Let me check/);
    expect(writing(draftArrived(NO_DRAFTS, draft("Two things:\n- the"), T0))).toBe("Two things:\n- the");
    expect(writing(draftArrived(NO_DRAFTS, draft(LONG), T0))).toBe(LONG);
  });

  it("shows a short draft once it has been written for 1.2 seconds without starting over", () => {
    let drafts = draftArrived(NO_DRAFTS, draft("Sure"), T0);
    const no = drafts.turns.cnv_1.run!.no;
    drafts = draftArrived(drafts, draft("Sure, one"), T0 + 400);
    expect(writing(drafts)).toBeNull();
    drafts = runRevealed(drafts, "cnv_1", "evt_1", no);
    expect(writing(drafts)).toBe("Sure, one");
    // Once shown it stays shown as it grows.
    expect(writing(draftArrived(drafts, draft("Sure, one moment"), T0 + SHOW_AFTER_MS + 100))).toBe("Sure, one moment");
  });

  it("never reveals a later run with the timer of one that was started over", () => {
    let drafts = draftArrived(NO_DRAFTS, draft("Let me check."), T0);
    const first = drafts.turns.cnv_1.run!.no;
    drafts = draftArrived(drafts, draft(""), T0 + 500);
    drafts = draftArrived(drafts, draft("Now the inbox."), T0 + 900);
    expect(runRevealed(drafts, "cnv_1", "evt_1", first)).toBe(drafts);
    expect(writing(runRevealed(drafts, "cnv_1", "evt_1", drafts.turns.cnv_1.run!.no))).toBe("Now the inbox.");
  });
});

describe("drafts: starting over", () => {
  it("lets a short line before a tool go without ever showing it", () => {
    const drafts = [draft("Let me check your calendar."), draft(""), draft("Now your inbox."), draft("")].reduce((d, next, i) => draftArrived(d, next, T0 + i * 300), NO_DRAFTS);
    expect(screen(drafts)).toEqual({ writing: null, steps: [], live: true });
  });

  it("keeps a draft that was shown as a step when Tex starts over, and writes the next one below it", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft(""), T0 + 100);
    expect(screen(drafts)).toEqual({ writing: null, steps: [LONG], live: true });
    drafts = draftArrived(drafts, draft(LATER), T0 + 2000);
    expect(screen(drafts)).toEqual({ writing: LATER, steps: [LONG], live: true });
  });

  it("takes a draft that doesn't carry on from the last as a new start, as when the empty one between them was skipped", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft("Here is"), T0 + 100);
    expect(screen(drafts)).toEqual({ writing: null, steps: [LONG], live: true });
    // A draft that only grows (or loses a trailing space) is the same run.
    let same = draftArrived(NO_DRAFTS, draft(`${LONG} `), T0);
    same = draftArrived(same, draft(`${LONG} And more.`), T0 + 100);
    expect(screen(same)).toEqual({ writing: `${LONG} And more.`, steps: [], live: true });
  });

  it("makes each thing Tex did a step of its own, after the text it wrote before it, and puts the crew's lines under the step they follow", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = progressArrived(drafts, line("Checked your calendar"));
    // The empty draft that started the run over comes after the line: nothing more to do.
    const settled = draftArrived(drafts, draft(""), T0 + 100);
    expect(screen(settled)).toEqual({ writing: null, steps: [LONG, "Checked your calendar"], live: true });
    drafts = progressArrived(settled, line("reading 3 pages", "scout"));
    drafts = progressArrived(drafts, line("Checked your inbox"));
    const steps = turnOnScreen(drafts, "cnv_1")!.steps;
    expect(steps.map((step) => [step.text, step.action ?? false, step.progress.map((p) => `${p.name}: ${p.text}`)])).toEqual([
      [LONG, false, []],
      ["Checked your calendar", true, ["Scout: reading 3 pages"]],
      ["Checked your inbox", true, []],
    ]);
    // A crew line while Tex writes goes with the text being written, as before.
    const writingNow = progressArrived(draftArrived(NO_DRAFTS, draft(LATER), T0), line("reading 3 pages", "scout"));
    expect(writingNow.turns.cnv_1.run!.progress.map((p) => p.text)).toEqual(["reading 3 pages"]);
  });

  it("lets a short line Tex never showed go when it goes on to a tool, and keeps the tool", () => {
    let drafts = draftArrived(NO_DRAFTS, draft("Let me check."), T0);
    drafts = progressArrived(drafts, line("Checked your inbox"));
    expect(screen(drafts)).toEqual({ writing: null, steps: ["Checked your inbox"], live: true });
    // A crew member at work with nothing on screen yet is a step of its own.
    const crew = progressArrived(draftArrived(NO_DRAFTS, draft("Let me"), T0), line("reading 3 pages", "scout"));
    expect(turnOnScreen(crew, "cnv_1")!.steps).toEqual([{ text: "", progress: [line("reading 3 pages", "scout")] }]);
  });

  it("keeps each conversation's turn to itself", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft(LATER, { conversationId: "cnv_2", turnId: "evt_2" }), T0);
    drafts = messageArrived(drafts, answer({ conversationId: "cnv_2" }));
    expect(writing(drafts)).toBe(LONG);
    expect(screen(drafts, "cnv_2")).toBeNull();
  });
});

describe("drafts: the answer", () => {
  it("takes the draft's place, and the steps fold into it", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft(""), T0 + 100);
    drafts = draftArrived(drafts, draft(LATER), T0 + 2000);
    drafts = messageArrived(drafts, answer());
    expect(screen(drafts)).toBeNull();
    expect(drafts.folded.msg_answer.map((step) => step.text)).toEqual([LONG]);
    // An answer with no steps before it folds nothing.
    const plain = messageArrived(draftArrived(NO_DRAFTS, draft(LONG), T0), answer({ id: "msg_plain" }));
    expect(plain.folded).toEqual({});
  });

  it("drops a draft of the turn that comes after its answer", () => {
    let drafts = draftArrived(NO_DRAFTS, draft("You have two"), T0);
    drafts = messageArrived(drafts, answer());
    drafts = draftArrived(drafts, draft("You have two meetings. And more words to make this long enough to be shown."), T0 + 100);
    expect(screen(drafts), "a late draft of the answered turn").toBeNull();
    // The next turn writes again.
    drafts = draftArrived(turnsOver(drafts), draft(LONG, { turnId: "evt_2", messageId: "msg_in2" }), T0 + 5000);
    expect(writing(drafts)).toBe(LONG);
  });

  it("drops the turn's last draft when the answer overtook it on the way, and only that one", () => {
    let drafts = messageArrived(NO_DRAFTS, answer());
    drafts = draftArrived(drafts, draft(LONG), T0);
    expect(screen(drafts)).toBeNull();
    drafts = draftArrived(drafts, draft(`${LONG} And`), T0 + 50);
    expect(screen(drafts), "still the answered turn").toBeNull();
    drafts = draftArrived(turnsOver(drafts), draft(LATER, { turnId: "evt_2" }), T0 + 5000);
    expect(writing(drafts)).toBe(LATER);
  });

  it("keeps writing when an approval card or a new incoming message arrives while the turn runs", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = messageArrived(drafts, answer({ id: "msg_card", approvalId: "ap_1" }));
    drafts = messageArrived(drafts, answer({ id: "msg_next", direction: "in" }));
    expect(writing(drafts)).toBe(LONG);
    expect(drafts.folded).toEqual({});
  });
});

describe("drafts: Tex stops to ask", () => {
  it("folds what Tex did before the question into its card, and keeps writing after it", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft(""), T0 + 100);
    drafts = messageArrived(drafts, answer({ id: "msg_card", approvalId: "ap_1" }));
    expect(drafts.folded.msg_card.map((step) => step.text)).toEqual([LONG]);
    expect(screen(drafts)).toEqual({ writing: null, steps: [], live: true });
    // The turn may still write; that is not the card.
    drafts = draftArrived(drafts, draft(LATER), T0 + 2000);
    expect(writing(drafts)).toBe(LATER);
  });

  it("folds what is left into the question when the turn ends there, leaving nothing under it", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft(""), T0 + 100);
    drafts = messageArrived(drafts, answer({ id: "msg_card", approvalId: "ap_1" }));
    drafts = draftArrived(drafts, draft(LATER), T0 + 2000);
    drafts = messageSettled(drafts, { id: "msg_in", direction: "in", status: "delivered" });
    expect(screen(drafts)).toBeNull();
    expect(drafts.folded.msg_card.map((step) => step.text)).toEqual([LONG, LATER]);
    expect(drafts.closed).toContain("evt_1");
  });

  it("ends the question's turn with nothing on screen when it showed no steps", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(""), T0);
    drafts = messageArrived(drafts, answer({ id: "msg_card", approvalId: "ap_1" }));
    drafts = turnsOver(drafts);
    expect(screen(drafts)).toBeNull();
    expect(drafts.folded).toEqual({});
  });
});

describe("drafts: a turn that ends without its answer", () => {
  it("keeps the steps on screen after a failed turn, and folds them into the apology", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft(""), T0 + 100);
    drafts = draftArrived(drafts, draft(LATER), T0 + 2000);
    // As the backend does it: the half-written answer is started over, then the turn fails.
    drafts = draftArrived(drafts, draft(""), T0 + 2500);
    drafts = messageSettled(drafts, { id: "msg_in", direction: "in", status: "failed" });
    expect(screen(drafts)).toEqual({ writing: null, steps: [LONG, LATER], live: false });
    // A draft of the failed turn that comes after its end is not shown.
    expect(draftArrived(drafts, draft(`${LATER} more`), T0 + 2600)).toBe(drafts);
    drafts = messageArrived(drafts, answer({ id: "msg_sorry" }));
    expect(screen(drafts)).toBeNull();
    expect(drafts.folded.msg_sorry.map((step) => step.text)).toEqual([LONG, LATER]);
  });

  it("keeps what was being written as a step when the turn ends, until the next message, whatever it is", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = turnsOver(drafts);
    expect(screen(drafts)).toEqual({ writing: null, steps: [LONG], live: false });
    // The person writes again: the steps fold into that message.
    drafts = messageArrived(drafts, answer({ id: "msg_next", direction: "in" }));
    expect(screen(drafts)).toBeNull();
    expect(drafts.folded.msg_next.map((step) => step.text)).toEqual([LONG]);
  });

  it("leaves nothing when the turn ends with nothing shown, and ends only the turn of the message that settled", () => {
    const hidden = draftArrived(NO_DRAFTS, draft("Let me"), T0);
    expect(screen(messageSettled(hidden, { id: "msg_in", direction: "in", status: "delivered" }))).toBeNull();
    expect(screen(turnsOver(hidden))).toBeNull();
    const shown = draftArrived(NO_DRAFTS, draft(LONG), T0);
    expect(messageSettled(shown, { id: "msg_in", direction: "in", status: "processing" })).toBe(shown);
    expect(messageSettled(shown, { id: "msg_other", direction: "in", status: "delivered" })).toBe(shown);
    expect(messageSettled(shown, { id: "msg_in", direction: "out", status: "delivered" })).toBe(shown);
  });

  it("carries what an ended turn left into the next turn of that conversation", () => {
    let drafts = turnsOver(draftArrived(NO_DRAFTS, draft(LONG), T0));
    drafts = draftArrived(drafts, draft(LATER, { turnId: "evt_2", messageId: null }), T0 + 5000);
    expect(screen(drafts)).toEqual({ writing: LATER, steps: [LONG], live: true });
  });
});

describe("drafts: after the stream was down", () => {
  it("ends the turns, and lets go of one that answers no message of its own", () => {
    let drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    drafts = draftArrived(drafts, draft(LATER, { conversationId: "cnv_auto", turnId: "evt_run", messageId: null }), T0);
    drafts = turnsOverAfterReconnect(drafts);
    expect(screen(drafts)).toEqual({ writing: null, steps: [LONG], live: false });
    expect(screen(drafts, "cnv_auto")).toBeNull();
  });

  it("finds the turn's answer in the thread asked for again, and folds the steps into it", () => {
    const turn = { messageId: "m2", startedAt: "2026-10-13T10:00:00.000Z" };
    const thread = [
      { id: "m4", direction: "out" as const, approvalId: null, createdAt: "2026-10-13T10:00:09.000Z" },
      { id: "m3", direction: "out" as const, approvalId: "ap_1", createdAt: "2026-10-13T10:00:05.000Z" },
      { id: "m2", direction: "in" as const, approvalId: null, createdAt: "2026-10-13T09:59:58.000Z" },
      { id: "m1", direction: "out" as const, approvalId: null, createdAt: "2026-10-13T09:59:00.000Z" },
    ];
    expect(answerInThread(thread, turn)).toBe("m4");
    expect(answerInThread(thread.slice(1), turn), "an approval card is not the answer").toBeNull();
    expect(answerInThread(thread, { ...turn, messageId: null })).toBeNull();
    // An answer to an earlier message, saved after this one was sent but before this turn began, isn't this turn's.
    const queued = [{ id: "a1", direction: "out" as const, approvalId: null, createdAt: "2026-10-13T09:59:59.000Z" }, ...thread.slice(2)];
    expect(answerInThread(queued, turn)).toBeNull();

    let drafts = turnsOverAfterReconnect(draftArrived(NO_DRAFTS, draft(LONG, { messageId: "m2" }), T0));
    drafts = turnAnswered(drafts, "cnv_1", "m4");
    expect(screen(drafts)).toBeNull();
    expect(drafts.folded.m4.map((step) => step.text)).toEqual([LONG]);
  });
});

describe("drafts: steps on screen", () => {
  it("reads a step as one line, without line breaks or Markdown's marks", () => {
    expect(stepLine("## Your day\n\n- **Design review** at 11\n- see [the doc](https://x.y)")).toBe("Your day Design review at 11 see the doc");
    expect(stepLine("Let me check `gcal`  and ~~that~~ this.")).toBe("Let me check gcal and that this.");
  });

  it("shows the last three steps and counts the earlier ones", () => {
    const steps = ["a", "b", "c", "d", "e"].map((text) => ({ text, progress: [] }));
    expect(stepsToShow(steps, false)).toEqual({ shown: steps.slice(2), earlier: 2 });
    expect(stepsToShow(steps, true)).toEqual({ shown: steps, earlier: 0 });
    expect(stepsToShow(steps.slice(0, 3), false)).toEqual({ shown: steps.slice(0, 3), earlier: 0 });
  });

  it("changes nothing it doesn't have to", () => {
    expect(turnsOver(NO_DRAFTS)).toBe(NO_DRAFTS);
    expect(turnsOverAfterReconnect(NO_DRAFTS)).toBe(NO_DRAFTS);
    expect(messageArrived(NO_DRAFTS, answer({ direction: "in" }))).toBe(NO_DRAFTS);
    const drafts = draftArrived(NO_DRAFTS, draft(LONG), T0);
    expect(draftArrived(drafts, draft(LONG), T0 + 10)).toBe(drafts);
    expect(messageSettled(drafts, { id: "msg_in", direction: "out", status: "delivered" })).toBe(drafts);
    expect(messageArrived(drafts, answer({ direction: "in" }))).toBe(drafts);
  });
});

describe("drafts: a turn with nothing on screen", () => {
  it("keeps what Tex did aside and gives it to the answer, as its trail", () => {
    let drafts = progressArrived(NO_DRAFTS, line("Looked at your apps"));
    drafts = progressArrived(drafts, line("Checked your inbox"));
    expect(screen(drafts), "no turn on screen").toBeNull();
    drafts = messageArrived(drafts, answer(), T0);
    expect(drafts.folded.msg_answer.map((step) => step.text)).toEqual(["Looked at your apps", "Checked your inbox"]);
    expect(trailLine(drafts.folded.msg_answer)).toBe("Checked your inbox · 2 steps");
    expect(drafts.loose).toEqual([]);
    // The next answer, with nothing done before it, gets no trail.
    expect(messageArrived(drafts, answer({ id: "msg_next" }), T0).folded.msg_next).toBeUndefined();
  });

  it("gives them to Tex's first draft when it starts writing, so they show above it", () => {
    let drafts = progressArrived(NO_DRAFTS, line("Checked your inbox"));
    drafts = draftArrived(drafts, draft(LONG), T0);
    expect(screen(drafts)).toEqual({ writing: LONG, steps: ["Checked your inbox"], live: true });
    expect(drafts.loose).toEqual([]);
    drafts = messageArrived(drafts, answer(), T0);
    expect(drafts.folded.msg_answer.map((step) => step.text)).toEqual(["Checked your inbox"]);
  });

  it("folds them into Tex's question, and what Tex does after it goes to the answer", () => {
    let drafts = progressArrived(NO_DRAFTS, line("Checked your inbox"));
    drafts = progressArrived(drafts, line("Asked for your OK"));
    drafts = messageArrived(drafts, answer({ id: "msg_card", approvalId: "ap_1" }), T0);
    expect(trailLine(drafts.folded.msg_card)).toBe("Asked for your OK · 2 steps");
    drafts = progressArrived(drafts, line("Sent an email"));
    drafts = messageArrived(drafts, answer({ id: "msg_done" }), T0);
    expect(trailLine(drafts.folded.msg_done)).toBe("Sent an email · 1 step");
  });

  it("still gives them to an answer that comes just after the turn ended, but not long after", () => {
    const done = turnsOver(progressArrived(NO_DRAFTS, line("Checked your inbox")), T0);
    expect(done.looseEndedAt).toBe(T0);
    expect(messageArrived(done, answer(), T0 + 2000).folded.msg_answer).toHaveLength(1);
    expect(messageArrived(done, answer(), T0 + LOOSE_KEPT_MS + 1).folded.msg_answer).toBeUndefined();
  });

  it("starts afresh for the next turn, and lets an ended turn's steps go when the person writes again", () => {
    let drafts = turnsOver(progressArrived(NO_DRAFTS, line("Checked your inbox")), T0);
    drafts = progressArrived(drafts, line("Checked your calendar"));
    expect(drafts.loose.map((step) => step.text)).toEqual(["Checked your calendar"]);
    expect(drafts.looseEndedAt).toBeNull();
    // While the turn runs, the person writing again changes nothing.
    expect(messageArrived(drafts, answer({ id: "msg_more", direction: "in" }), T0)).toBe(drafts);
    drafts = messageArrived(turnsOver(drafts, T0), answer({ id: "msg_more", direction: "in" }), T0 + 100);
    expect(drafts.loose).toEqual([]);
    expect(drafts.folded.msg_more).toBeUndefined();
    // After the stream was down they can't be matched to an answer: they go.
    expect(turnsOverAfterReconnect(progressArrived(NO_DRAFTS, line("x"))).loose).toEqual([]);
  });

  it("shows a line from an older container as it came", () => {
    const drafts = messageArrived(progressArrived(NO_DRAFTS, line("using Bash")), answer(), T0);
    expect(trailLine(drafts.folded.msg_answer)).toBe("using Bash · 1 step");
  });
});

describe("drafts: the trail on an answer", () => {
  const text = (value: string) => ({ text: value, progress: [] });
  const did = (value: string) => ({ text: value, progress: [], action: true as const });

  it("names the last thing Tex did, and counts every step", () => {
    expect(trailLine([did("Looked at your apps"), did("Checked your inbox")])).toBe("Checked your inbox · 2 steps");
    expect(trailLine([did("Checked your inbox"), text(LONG)]), "what Tex did, not what it wrote").toBe("Checked your inbox · 2 steps");
    expect(trailLine([text("**Your day** looks\nbusy")])).toBe("Your day looks busy · 1 step");
    expect(trailLine([{ text: "", progress: [line("reading 4 pages", "scout")] }])).toBe("Scout: reading 4 pages · 1 step");
    expect(trailLine([{ text: "", progress: [] }])).toBe("1 step");
  });

  it("reads a step as one line", () => {
    expect(stepLabel(did("Checked your inbox"))).toBe("Checked your inbox");
    expect(stepLabel({ text: "", progress: [line("done", "scout")] })).toBe("Scout: done");
  });
});
