import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Approval, Message, StreamEvent } from "./api/client";
import { cachedThread, fetchAgentStatus, pageAfterCache, qk } from "./api/hooks";
import { applyStreamEvent, catchUpAfterReconnect, SETTLE_CHECK_MS } from "./api/stream";
import { answerInThread, DRAFTS_KEY, type Drafts, NO_DRAFTS, turnOnScreen } from "./drafts";
import { asAsked, footAtWork, threadFoot, type TurnFoot, turnQuestion } from "./turn-line";

const CONVERSATION = "cnv_web";
const OTHER = "cnv_other";
const T0 = Date.UTC(2026, 9, 17, 7, 21, 0);
const at = (ms: number) => new Date(T0 + ms).toISOString();

function message(id: string, rest: Partial<Message> = {}): Message {
  return { id, conversationId: CONVERSATION, channel: "web", direction: "in", text: "check my GitHub", status: "queued", approvalId: null, createdAt: at(0), ...rest };
}
const asked = (status: Message["status"]) => message("msg_in", { status });
const tex = (id: string, ms: number, rest: Partial<Message> = {}) => message(id, { direction: "out", text: `Tex: ${id}`, status: "sent", createdAt: at(ms), ...rest });

// ---------------------------------------------------------------- the rule on its own

describe("turnQuestion", () => {
  it("finds Tex's question among its messages since the person's newest one, also with a line after it", () => {
    expect(turnQuestion([tex("card", 5, { approvalId: "apr_1" }), asked("processing")])).toBe("apr_1");
    expect(turnQuestion([tex("line", 6), tex("card", 5, { approvalId: "apr_1" }), asked("processing")])).toBe("apr_1");
  });

  it("finds none once the person wrote again, or when Tex asked nothing", () => {
    expect(turnQuestion([asked("queued"), tex("card", 5, { approvalId: "apr_1" })])).toBeNull();
    expect(turnQuestion([tex("answer", 6), asked("delivered")])).toBeNull();
    expect(turnQuestion([])).toBeNull();
  });
});

describe("footAtWork", () => {
  it("says Tex is at work for the bubble and the line while Tex works or writes (the quiet stream is then checked), not while it waits for the OK", () => {
    expect((["start", "working", "writing", "waiting", null] as TurnFoot[]).map(footAtWork)).toEqual([true, true, true, false, false]);
  });
});

describe("asAsked", () => {
  const thread = [tex("line", 6_000), tex("card", 5_000, { approvalId: "apr_1" }), asked("processing")];

  it("leaves out what Tex wrote after its question while the person hasn't answered it", () => {
    expect(asAsked(thread, { status: "pending", decidedAt: null }).map((m) => m.id)).toEqual(["card", "msg_in"]);
    expect(asAsked(thread, { status: "approved", decidedAt: at(9_000) }).map((m) => m.id)).toEqual(["card", "msg_in"]);
  });

  it("reads the thread as it is once Tex wrote after the answer, or the question expired or isn't known", () => {
    const followedUp = [tex("done", 12_000), ...thread];
    expect(asAsked(followedUp, { status: "approved", decidedAt: at(9_000) })).toBe(followedUp);
    expect(asAsked(thread, { status: "expired", decidedAt: null })).toBe(thread);
    expect(asAsked(thread, undefined)).toBe(thread);
    expect(asAsked([asked("processing")], undefined)).toEqual([asked("processing")]);
  });
});

describe("threadFoot", () => {
  const busy = { state: "busy" as const, lastActiveAt: at(1_500) };
  const awake = { state: "awake" as const, lastActiveAt: at(20_000) };
  const foot = (input: Partial<Parameters<typeof threadFoot>[0]>) =>
    threadFoot({ status: busy, messages: [asked("processing")], approval: undefined, answeredHere: false, turn: null, ...input });
  const writingTurn = { steps: [], writing: "Here are your open pull requests", live: true };
  const stepsTurn = { steps: [{ text: "Looked at your apps", progress: [], action: true as const }], writing: null, live: true };

  it("shows Tex at work from Send, while the message waits for the agent, and not for one never taken", () => {
    const awakeBefore = { state: "awake" as const, lastActiveAt: at(-60_000) };
    expect(foot({ status: awakeBefore, messages: [asked("queued")], now: T0 + 3_000 })).toBe("start");
    // Never taken (its turn never ran): after 2 minutes, nothing.
    expect(foot({ status: awakeBefore, messages: [asked("queued")], now: T0 + 2 * 60_000 + 1 })).toBeNull();
    // A second message sent while the line shows under the turn's steps: the line stays.
    const steps = { steps: [{ text: "Looked at your apps", progress: [], action: true as const }], writing: null, live: true };
    expect(foot({ messages: [asked("queued"), message("msg_first", { status: "processing" })], turn: steps, now: T0 + 3_000 })).toBe("working");
  });

  it("is the bubble until anything of the turn is on screen, then the line", () => {
    expect(foot({})).toBe("start");
    expect(foot({ turn: { steps: [], writing: null, live: true } })).toBe("start");
    expect(foot({ turn: writingTurn })).toBe("writing");
    expect(foot({ turn: stepsTurn })).toBe("working");
    // Tex posted an automation's draft in the middle of the turn: the line stays under it.
    expect(foot({ messages: [tex("draft-card", 4_000, { automationDraftId: "drf_1" }), asked("processing")] })).toBe("working");
  });

  it("goes when the turn is over: the message delivered or failed, or the agent no longer busy", () => {
    expect(foot({ messages: [tex("answer", 9_000), asked("delivered")] })).toBeNull();
    expect(foot({ messages: [tex("sorry", 9_000), asked("failed")] })).toBeNull();
    expect(foot({ status: awake, messages: [tex("answer", 9_000), asked("processing")] })).toBeNull();
  });

  it("says Tex waits for the OK once it asked, also with a line written after the question", () => {
    const pending = { status: "pending" as const, decidedAt: null };
    const card = tex("card", 5_000, { approvalId: "apr_1" });
    expect(foot({ messages: [card, asked("processing")], approval: pending })).toBe("waiting");
    expect(foot({ messages: [tex("line", 6_000), card, asked("processing")], approval: pending })).toBe("waiting");
    expect(foot({ status: awake, messages: [tex("line", 6_000), card, asked("delivered")], approval: pending })).toBe("waiting");
    // Tex still writing that line: the line says so, in the same place.
    expect(foot({ messages: [card, asked("processing")], approval: pending, turn: writingTurn })).toBe("writing");
  });

  it("shows Tex at work on what follows an answer, under the question, until its follow-up says something", () => {
    const approved = { status: "approved" as const, decidedAt: at(9_000) };
    const card = tex("card", 5_000, { approvalId: "apr_1" });
    const thread = [tex("line", 6_000), card, asked("delivered")];
    expect(foot({ status: awake, messages: thread, approval: approved, answeredHere: true })).toBe("working");
    expect(foot({ status: { state: "busy", lastActiveAt: at(12_000) }, messages: thread, approval: approved })).toBe("working");
    expect(foot({ status: awake, messages: [tex("done", 20_000), ...thread], approval: approved })).toBeNull();
  });

  it("shows a turn with no message of the person's here (an automation's run) once it writes here", () => {
    expect(foot({ messages: [tex("earlier", -60_000)], turn: { steps: [], writing: null, live: true } })).toBe("start");
    expect(foot({ messages: [tex("earlier", -60_000)], turn: stepsTurn })).toBe("working");
    expect(foot({ status: awake, messages: [tex("earlier", -60_000)], turn: { ...stepsTurn, live: false } })).toBeNull();
  });
});

// ---------------------------------------------------------------- whole turns, event by event

/**
 * The chat screen with a real query cache, fed the events of a turn as the backend sends them. After
 * each event (and each pause) it notes what the foot of the open thread shows, worked out as the
 * thread does it (`Thread` in `src/components/chat/thread.tsx`).
 */
function chatScreen(open = CONVERSATION) {
  const server = { thread: [] as Message[], status: { state: "awake", lastActiveAt: null } as AgentStatus };
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: false } } });
  qc.mount();
  const thread = new InfiniteQueryObserver(qc, {
    queryKey: qk.thread(open),
    initialPageParam: undefined as string | undefined,
    queryFn: async () => pageAfterCache(qc, open, { items: [...server.thread], nextCursor: null }),
    getNextPageParam: () => undefined,
  });
  const status = new QueryObserver(qc, { queryKey: qk.agentStatus, queryFn: () => fetchAgentStatus(qc, async () => server.status) });
  const stops = [thread.subscribe(() => {}), status.subscribe(() => {})];
  let answeredHere = false;
  const seen: TurnFoot[] = [];

  const foot = (): TurnFoot => {
    const messages = cachedThread(qc, open) ?? [];
    const onScreen = turnOnScreen(qc.getQueryData<Drafts>(DRAFTS_KEY) ?? NO_DRAFTS, open);
    const turn = onScreen && answerInThread(messages, onScreen.turn) ? null : onScreen;
    const question = turnQuestion(messages);
    const approval = question ? qc.getQueryData<Approval>(["approval", question]) : undefined;
    return threadFoot({ status: qc.getQueryData<AgentStatus>(qk.agentStatus), messages, approval, answeredHere, turn, now: Date.now() });
  };
  const note = () => seen.push(foot());
  const send = (type: StreamEvent["type"], data: StreamEvent["data"]) => {
    applyStreamEvent(qc, { type, data });
    note();
  };
  const wait = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    note();
  };
  const draft = (text: string, turnId = "evt_turn", conversationId = CONVERSATION) =>
    send("message.draft", { conversationId, turnId, messageId: conversationId === CONVERSATION ? "msg_in" : "msg_b", text, at: at(1_000) });
  const progress = (text: string, crew: string | null = null) => send("agent.progress", { text, crew, at: at(1_000) } as StreamEvent["data"]);
  /** Writes `text` a few words at a time, as the Bridge does (about four times a second). */
  const write = async (text: string, turnId?: string) => {
    for (let end = 12; end < text.length + 12; end += 12) {
      draft(text.slice(0, end), turnId);
      await wait(250);
    }
  };
  /** What the foot showed, from the person's message on, with each stretch of the same thing as one entry. */
  const shown = () => seen.filter((value, index) => index === 0 || value !== seen[index - 1]);
  return {
    qc,
    server,
    send,
    wait,
    draft,
    progress,
    write,
    shown,
    foot,
    answerHere: () => (answeredHere = true),
    close: () => stops.forEach((stop) => stop()),
  };
}

const LONG_LINE = "GitHub is connected. I'll look at each of your repositories for pull requests that are still open.";
const ANSWER = "Here are your **3 open pull requests**:\n\n1. Fix the login redirect\n2. Add CSV export\n3. Bump the Node version";

/**
 * The person's message, sent and then taken by the agent 2.5 seconds later (a warm container), as the
 * backend sends it. Tex shows at work from Send: the bubble, with nothing in between.
 */
async function taken(screen: ReturnType<typeof chatScreen>) {
  screen.send("message.created", asked("queued"));
  expect(screen.foot()).toBe("start");
  await screen.wait(2_500);
  screen.send("message.status", asked("processing"));
  screen.send("agent.status", { state: "busy", lastActiveAt: at(2_500) });
}

/** The turn's end, as the backend sends it: the message's last state, then the agent awake. */
function ended(screen: ReturnType<typeof chatScreen>, status: Message["status"] = "delivered") {
  screen.send("message.status", asked(status));
  screen.send("agent.status", { state: "awake", lastActiveAt: at(30_000) });
}

/** Steady: the bubble at most at the start, then the one line until the turn is over, never off and on again. */
function expectSteady(shown: TurnFoot[], end: TurnFoot = null) {
  const line = shown.slice(shown[0] === "start" ? 1 : 0);
  expect(line.at(-1)).toBe(end);
  for (const value of line.slice(0, -1)) expect(["working", "writing", "waiting"]).toContain(value);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a turn of several steps keeps one line from its first step to its end", () => {
  it("through drafts, tools, pauses between steps and the answer", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    await taken(screen);
    // A short line before a tool: never shown. Then the tool.
    screen.draft("Let me check.");
    await screen.wait(300);
    screen.draft("");
    screen.progress("Looked at your apps");
    // A pause between steps (the model thinking).
    await screen.wait(6_000);
    // A line worth showing, then a tool, then a slow one.
    await screen.write(LONG_LINE);
    screen.draft("");
    screen.progress("Ran an app action");
    await screen.wait(25_000);
    screen.progress("Read a web page");
    await screen.wait(4_000);
    screen.progress("Read a web page");
    // The answer, written, then saved: the line goes with it. The turn ends half a second later
    // (`answer_sent` to `finished`), and nothing comes back.
    await screen.write(ANSWER);
    screen.send("message.created", tex("msg_answer", 40_000, { text: ANSWER }));
    expect(screen.foot()).toBeNull();
    await screen.wait(500);
    ended(screen);

    expect(screen.shown()).toEqual(["start", "working", "writing", "working", "writing", null]);
    expectSteady(screen.shown());
    screen.close();
  });

  it("through an automation's draft Tex posts in the middle of the turn (it is not the answer)", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    await taken(screen);
    screen.progress("Looked at your apps");
    const card = tex("msg_draft", 5_000, { text: "Here is a draft: a summary of your open pull requests every morning.", automationDraftId: "drf_1" });
    screen.send("message.created", card);
    expect(screen.foot()).toBe("working");
    expect(cachedThread(screen.qc, CONVERSATION)?.find((item) => item.id === "msg_in")?.status).toBe("processing");
    // The turn carries on: the API, asked again later, says so too.
    screen.server.thread = [card, asked("processing")];
    screen.server.status = { state: "busy", lastActiveAt: at(1_500) };
    screen.progress("Scout: reading 4 pages", "scout");
    await screen.wait(SETTLE_CHECK_MS);
    await screen.wait(20_000);
    screen.send("message.created", tex("msg_answer", 40_000, { text: ANSWER }));
    expect(screen.foot()).toBeNull();
    await screen.wait(500);
    ended(screen);

    expect(screen.shown()).toEqual(["start", "working", null]);
    screen.close();
  });

  it("through the stream coming back without its events, and the agent's state asked again", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    await taken(screen);
    screen.progress("Looked at your apps");
    await screen.write(LONG_LINE);
    screen.draft("");
    screen.server.thread = [asked("processing")];
    screen.server.status = { state: "busy", lastActiveAt: at(1_500) };
    // The host cut the stream, and the backend could not send what was missed.
    catchUpAfterReconnect(screen.qc, true);
    await screen.wait(0);
    // The tab shown again: the agent's state is asked for again.
    void screen.qc.invalidateQueries({ queryKey: qk.agentStatus });
    await screen.wait(0);
    await screen.write(LONG_LINE);
    screen.send("message.created", tex("msg_answer", 40_000, { text: ANSWER }));
    ended(screen);

    expectSteady(screen.shown());
    expect(screen.shown()).toEqual(["start", "working", "writing", "working", "writing", null]);
    screen.close();
  });
});

describe("from Send", () => {
  it("shows the bubble at once, with no gap when the agent takes the message (its `processing` comes just before `busy`)", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.send("message.created", asked("queued"));
    await screen.wait(2_500);
    screen.send("message.status", asked("processing"));
    expect(screen.foot()).toBe("start");
    screen.send("agent.status", { state: "busy", lastActiveAt: at(2_500) });
    expect(screen.shown()).toEqual(["start"]);
    screen.close();
  });

  it("doesn't take a late `processing` for a message that has moved on for the agent at work", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.send("message.created", asked("queued"));
    screen.send("message.status", asked("delivered"));
    screen.send("message.status", asked("processing"));
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("awake");
    expect(screen.shown()).toEqual(["start", null]);
    screen.close();
  });

  it("keeps the bubble through a quick reply (no agent: the message is never taken), until the reply", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.send("message.created", asked("queued"));
    await screen.wait(1_200);
    screen.send("message.created", tex("msg_hi", 1_200, { text: "Hey! How can I help you today?" }));
    await screen.wait(100);
    screen.send("message.status", asked("delivered"));
    expect(screen.shown()).toEqual(["start", null]);
    screen.close();
  });
});

describe("Tex's answer ends the turn on screen at once, whatever comes of the turn's last events", () => {
  // The founder's "list all the pr across repo" (web chat, 17 October, 10:58:45 UTC). The container
  // was made again for a new image as the message woke it (about 4 seconds); the answer, a table of
  // his pull requests, was sent 27 seconds after the message, and the turn ended on the server 0.4
  // seconds later (the message `delivered`, then the agent awake). In the web app "Tex is working…"
  // stayed under the answer for a while: the line waited for those two events, and only the check 10
  // seconds after the answer ended it when they didn't come.
  const TABLE = "| Repo | Pull request | State |\n|---|---|---|\n| textcrew | Fix the login redirect | open |\n| textcrew | Add CSV export | open |";
  const answer = tex("msg_answer", 27_040, { text: TABLE });
  const statusOf = (screen: ReturnType<typeof chatScreen>, id: string) => cachedThread(screen.qc, CONVERSATION)?.find((item) => item.id === id)?.status;

  async function upToTheAnswer(screen: ReturnType<typeof chatScreen>) {
    screen.send("message.created", asked("queued"));
    await screen.wait(340);
    screen.send("agent.status", { state: "waking", lastActiveAt: null });
    await screen.wait(4_100);
    screen.send("agent.status", { state: "busy", lastActiveAt: at(4_440) });
    screen.send("message.status", asked("processing"));
    screen.progress("Looked at your apps");
    await screen.wait(5_000);
    screen.progress("Ran an app action");
    await screen.wait(12_000);
    await screen.write(TABLE);
    // What the API says once the turn is over, whenever it is asked.
    screen.server.thread = [answer, asked("delivered")];
    screen.server.status = { state: "awake", lastActiveAt: at(27_450) };
  }
  const answered = (screen: ReturnType<typeof chatScreen>) => {
    screen.send("message.created", answer);
    expect(screen.foot()).toBeNull();
    expect(statusOf(screen, "msg_in")).toBe("delivered");
  };
  const delivered = (screen: ReturnType<typeof chatScreen>) => screen.send("message.status", asked("delivered"));
  const idle = (screen: ReturnType<typeof chatScreen>) => screen.send("agent.status", { state: "awake", lastActiveAt: at(27_450) });

  const orders: [string, (screen: ReturnType<typeof chatScreen>) => Promise<void>][] = [
    [
      "after it, as the backend sends them",
      async (screen) => {
        answered(screen);
        await screen.wait(200);
        delivered(screen);
        await screen.wait(200);
        idle(screen);
      },
    ],
    [
      "after it, held on the way for 8 seconds",
      async (screen) => {
        answered(screen);
        await screen.wait(8_000);
        delivered(screen);
        idle(screen);
      },
    ],
    ["never", async (screen) => answered(screen)],
    [
      "before it",
      async (screen) => {
        delivered(screen);
        idle(screen);
        answered(screen);
      },
    ],
    [
      "the agent's idle state before it, the message's `delivered` never",
      async (screen) => {
        idle(screen);
        answered(screen);
      },
    ],
    [
      "the message's `delivered` after it, the agent's idle state never",
      async (screen) => {
        answered(screen);
        await screen.wait(300);
        delivered(screen);
      },
    ],
    [
      "the agent's idle state after it, the message's `delivered` never",
      async (screen) => {
        answered(screen);
        await screen.wait(300);
        idle(screen);
      },
    ],
  ];

  it.each(orders)("the line goes with the answer: its last events %s", async (_, rest) => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    await upToTheAnswer(screen);
    expect(screen.foot()).toBe("writing");
    await rest(screen);
    // Nothing brings it back: not the events, nor the check 10 seconds after the answer.
    await screen.wait(SETTLE_CHECK_MS);

    expect(screen.shown()).toEqual(["start", "working", "writing", null]);
    expect(statusOf(screen, "msg_in")).toBe("delivered");
    // What the lost events said is asked for: the agent isn't left busy.
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("awake");
    screen.close();
  });

  // The founder's "Review every new pull request in code smith" (web chat, 17 October, 11:17:14 UTC):
  // a plain answer, no card, no tool. The turn started 0.3 seconds after the message; its draft came
  // 7.8 seconds later, the answer 10.3 seconds after the start, and the turn ended on the server 0.4
  // seconds after the answer. The answer took the draft's place, and the line went back to "Tex is
  // working…" under it, waiting for the turn's last two events.
  const REVIEW = "Done: every new pull request in code-smith gets a review from Patch, and I post it on the pull request for you.";
  const reviewAnswer = tex("msg_review", 10_563, { text: REVIEW });
  const fates: [string, (screen: ReturnType<typeof chatScreen>) => Promise<void>][] = [
    [
      "come as the backend sends them",
      async (screen) => {
        await screen.wait(200);
        delivered(screen);
        await screen.wait(200);
        idle(screen);
      },
    ],
    [
      "are held on the way for 8 seconds",
      async (screen) => {
        await screen.wait(8_000);
        delivered(screen);
        idle(screen);
      },
    ],
    ["never come", async () => {}],
  ];

  it.each(fates)("a plain answer written as a draft first: the line goes as the answer takes the draft's place, and the turn's last events %s", async (_, rest) => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.send("message.created", asked("queued"));
    await screen.wait(300);
    screen.send("agent.status", { state: "busy", lastActiveAt: at(1_500) });
    screen.send("message.status", asked("processing"));
    await screen.wait(6_600);
    await screen.write(REVIEW);
    expect(screen.foot()).toBe("writing");
    screen.server.thread = [reviewAnswer, asked("delivered")];
    screen.server.status = { state: "awake", lastActiveAt: at(10_900) };
    screen.send("message.created", reviewAnswer);
    expect(screen.foot()).toBeNull();
    expect(statusOf(screen, "msg_in")).toBe("delivered");
    await rest(screen);
    await screen.wait(SETTLE_CHECK_MS);

    expect(screen.shown()).toEqual(["start", "writing", null]);
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("awake");
    screen.close();
  });

  it("but a message sent while Tex worked waits for a turn of its own: the line stays after the first answer, and goes with the second", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    await taken(screen);
    screen.progress("Looked at your apps");
    await screen.write(LONG_LINE);
    await screen.wait(500);
    const second = (status: Message["status"]) => message("msg_b", { text: "and the closed ones?", status, createdAt: at(5_000) });
    screen.send("message.created", second("queued"));
    screen.draft("");
    screen.send("message.created", tex("msg_answer", 9_000, { text: ANSWER }));
    expect(screen.foot()).toBe("working");
    expect(statusOf(screen, "msg_in")).toBe("delivered");
    expect(statusOf(screen, "msg_b")).toBe("queued");
    ended(screen);
    expect(screen.foot()).toBe("working");

    // The second message's turn.
    await screen.wait(1_000);
    screen.send("agent.status", { state: "busy", lastActiveAt: at(11_000) });
    screen.send("message.status", second("processing"));
    screen.send("message.draft", { conversationId: CONVERSATION, turnId: "evt_b", messageId: "msg_b", text: `${LONG_LINE} And the closed ones too.`, at: at(12_000) });
    expect(screen.foot()).toBe("writing");
    screen.send("message.created", tex("msg_answer_b", 14_000, { text: "Here are the closed ones." }));
    expect(screen.foot()).toBeNull();
    expect(statusOf(screen, "msg_b")).toBe("delivered");
    screen.send("message.status", second("delivered"));
    screen.send("agent.status", { state: "awake", lastActiveAt: at(14_500) });

    expect(screen.shown()).toEqual(["start", "working", "writing", "working", "writing", null]);
    screen.close();
  });
});

describe("the line goes when the turn is really over", () => {
  it("on a failed turn: the apology, then the message failed", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    await taken(screen);
    await screen.write(LONG_LINE);
    screen.draft("");
    screen.send("message.created", tex("msg_sorry", 9_000, { text: "Sorry, something went wrong on our side." }));
    ended(screen, "failed");

    expect(screen.shown()).toEqual(["start", "writing", "working", null]);
    screen.close();
  });

  it("on a question: waiting for the OK, also after the line Tex writes under it; then Tex at work on the answer", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    await taken(screen);
    screen.progress("Looked at your apps");
    const approval: Approval = { id: "apr_1", kind: "app_action", status: "pending", summary: "Close issue #2", app: "github", action: "GITHUB_UPDATE_ISSUE", details: {}, createdAt: at(11_000), expiresAt: at(86_400_000), decidedAt: null };
    screen.send("approval.created", approval);
    screen.send("message.created", tex("msg_card", 11_000, { approvalId: "apr_1", text: "I'd like to close issue #2. Approve or Deny below." }));
    expect(screen.foot()).toBe("waiting");
    // As on 17 October at 05:20: Tex writes a line after the card before its turn ends.
    await screen.write("Waiting for your approval to close issue #2: you'll see the buttons above.");
    screen.send("message.created", tex("msg_waiting", 15_000, { text: "Waiting for your approval to close issue #2." }));
    expect(screen.foot()).toBe("waiting");
    ended(screen);
    expect(screen.foot()).toBe("waiting");

    // Approved here: Tex is at work on it at once, then while its follow-up runs.
    screen.answerHere();
    screen.send("approval.resolved", { ...approval, status: "approved", decidedAt: at(16_000) });
    screen.send("agent.status", { state: "busy", lastActiveAt: at(18_000) });
    screen.progress("Ran an app action");
    await screen.write("Done! Issue #2 is now closed.", "evt_follow_up");
    screen.send("message.created", tex("msg_done", 28_000, { text: "Done! Issue #2 is now closed." }));
    screen.send("agent.status", { state: "awake", lastActiveAt: at(28_500) });

    // The follow-up's short answer is never worth showing as it is written: the line says "working" until it arrives.
    expect(screen.shown()).toEqual(["start", "waiting", "writing", "waiting", "working", null]);
    expectSteady(screen.shown());
    screen.close();
  });

  it("and is never shown for a turn in another chat", async () => {
    const screen = chatScreen(CONVERSATION);
    await vi.advanceTimersByTimeAsync(0);
    screen.send("message.created", tex("msg_old", -60_000));
    screen.send("message.created", message("msg_b", { conversationId: OTHER, status: "processing" }));
    screen.send("agent.status", { state: "busy", lastActiveAt: at(1_500) });
    screen.progress("Looked at your apps");
    screen.draft(LONG_LINE, "evt_b", OTHER);
    screen.send("message.created", message("msg_b_answer", { conversationId: OTHER, direction: "out", status: "sent", createdAt: at(9_000) }));
    screen.send("agent.status", { state: "awake", lastActiveAt: at(10_000) });

    expect(screen.shown()).toEqual([null]);
    screen.close();
  });
});
