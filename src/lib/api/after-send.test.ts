import { InfiniteQueryObserver, MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { threadActivity } from "../chat-thread";
import type { AgentStatus, Message, StreamEvent } from "./client";
import { cachedThread, fetchAgentStatus, pageAfterCache, qk, sendMessageOptions } from "./hooks";
import { applyStreamEvent, QUIET_CHECK_EVERY_MS, QUIET_WHILE_WORKING_MS, quietTooLong, SETTLE_CHECK_MS, watchQuietWhileWorking } from "./stream";

// The first seconds after the founder sends a message in web chat (17 October, 05:20:06). The
// thread shows his message at once; the api saves it in about 0.8 s; the worker takes the job and
// the agent accepts it about 1.5 s later (`processing`, `busy`), 4 to 7 s when the container has to
// wake. Before, "Tex is working…" waited for that, and for the live stream to bring it.

const CONVERSATION = "cnv_web";
const START = Date.parse("2026-10-17T05:20:06.500Z");
const ID = "4b0e8f0a-2a43-4c1f-9d55-0e7f1c1b9a01";

function saved(rest: Partial<Message> = {}): Message {
  return {
    id: "msg_new",
    conversationId: CONVERSATION,
    channel: "web",
    direction: "in",
    text: "check my email",
    status: "queued",
    approvalId: null,
    clientMessageId: ID,
    createdAt: new Date(START + 300).toISOString(),
    ...rest,
  };
}
const earlier = saved({ id: "msg_old", text: "hi", clientMessageId: undefined, status: "delivered", createdAt: "2026-10-17T05:17:01.000Z" });
const answer = saved({ id: "msg_answer", direction: "out", text: "You have 2 new emails.", clientMessageId: undefined, createdAt: new Date(START + 17_000).toISOString() });

/** The open chat with a real query cache: the thread and the agent's state are watched, and asking again gets what the API says now. */
function chatScreen() {
  const server = { thread: [earlier] as Message[], status: { state: "awake", lastActiveAt: null } as AgentStatus };
  const asked = { thread: 0, status: 0 };
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: false } } });
  qc.mount();
  const thread = new InfiniteQueryObserver(qc, {
    queryKey: qk.thread(CONVERSATION),
    initialPageParam: undefined as string | undefined,
    queryFn: async () => {
      asked.thread++;
      return pageAfterCache(qc, CONVERSATION, { items: [...server.thread], nextCursor: null });
    },
    getNextPageParam: () => undefined,
  });
  const status = new QueryObserver(qc, {
    queryKey: qk.agentStatus,
    queryFn: () =>
      fetchAgentStatus(qc, async () => {
        asked.status++;
        return server.status;
      }),
  });
  const stops = [thread.subscribe(() => {}), status.subscribe(() => {})];
  let saveIt!: (message: Message) => void;
  const send = new MutationObserver(qc, sendMessageOptions(qc, () => new Promise<Message>((resolve) => (saveIt = resolve))));
  const event = (type: StreamEvent["type"], data: StreamEvent["data"]) => applyStreamEvent(qc, { type, data });
  const activity = () =>
    threadActivity({ status: qc.getQueryData<AgentStatus>(qk.agentStatus), messages: cachedThread(qc, CONVERSATION) ?? [], approval: undefined, answeredHere: false });
  return {
    qc,
    server,
    asked,
    event,
    activity,
    send: () => void send.mutate({ text: "check my email", clientMessageId: ID, conversationId: CONVERSATION }),
    saved: (message: Message) => saveIt(message),
    close: () => stops.forEach((stop) => stop()),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

async function opened() {
  const screen = chatScreen();
  await vi.advanceTimersByTimeAsync(0);
  screen.asked.thread = 0;
  screen.asked.status = 0;
  return screen;
}

describe("the first seconds after sending", () => {
  it("shows Tex at work the moment the message is sent, all the way to the answer", async () => {
    const screen = await opened();
    expect(screen.activity()).toBeNull();
    screen.send();
    await vi.advanceTimersByTimeAsync(0);
    // Only the "sending" bubble so far: no answer from the api, no event.
    expect(screen.activity()).toBe("working");

    await vi.advanceTimersByTimeAsync(800);
    screen.saved(saved());
    screen.event("message.created", saved());
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.activity()).toBe("working");

    // The agent takes it (the backend says busy first, then the message's new state).
    await vi.advanceTimersByTimeAsync(1_500);
    screen.event("agent.status", { state: "busy", lastActiveAt: new Date().toISOString() });
    expect(screen.activity()).toBe("working");
    screen.event("message.status", saved({ status: "processing" }));
    expect(screen.activity()).toBe("working");

    await vi.advanceTimersByTimeAsync(14_700);
    screen.event("message.created", answer);
    screen.event("message.status", saved({ status: "delivered" }));
    screen.event("agent.status", { state: "awake", lastActiveAt: new Date().toISOString() });
    expect(screen.activity()).toBeNull();
    screen.close();
  });

  it("shows it while the container wakes for the message", async () => {
    const screen = await opened();
    screen.send();
    await vi.advanceTimersByTimeAsync(800);
    screen.saved(saved());
    screen.event("agent.status", { state: "waking", lastActiveAt: null });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(screen.activity()).toBe("working");
    screen.close();
  });

  it("takes it away when the send fails", async () => {
    const screen = chatScreen();
    let refuse!: (error: Error) => void;
    const send = new MutationObserver(screen.qc, sendMessageOptions(screen.qc, () => new Promise<Message>((_, reject) => (refuse = reject))));
    await vi.advanceTimersByTimeAsync(0);
    void send.mutate({ text: "check my email", clientMessageId: ID, conversationId: CONVERSATION }).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.activity()).toBe("working");
    refuse(new Error("Sign in to continue"));
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.activity()).toBeNull();
    screen.close();
  });

  it("ends after a quick reply whose 'delivered' never arrived: the API is asked after the answer", async () => {
    const screen = await opened();
    screen.event("message.created", saved());
    expect(screen.activity()).toBe("working");
    // A quick reply: no agent, no busy. Its message's last event is lost on the way.
    await vi.advanceTimersByTimeAsync(2_000);
    screen.server.thread = [{ ...answer, status: "sent" }, saved({ status: "delivered" }), earlier];
    screen.event("message.created", { ...answer, createdAt: new Date().toISOString() });
    expect(screen.activity()).toBe("working");
    await vi.advanceTimersByTimeAsync(SETTLE_CHECK_MS);
    expect(screen.asked.thread).toBe(1);
    expect(screen.activity()).toBeNull();
    screen.close();
  });
});

describe("a live connection that goes quiet while Tex works", () => {
  it("asks again for the thread and the agent's state after 30 quiet seconds, then every 30 seconds", async () => {
    const screen = await opened();
    screen.event("message.created", saved());
    let heardAt = Date.now();
    const stop = watchQuietWhileWorking(screen.qc, CONVERSATION, () => heardAt);

    await vi.advanceTimersByTimeAsync(QUIET_WHILE_WORKING_MS - QUIET_CHECK_EVERY_MS);
    expect(screen.asked).toEqual({ thread: 0, status: 0 });
    // The turn ended on the server; nothing of it came through.
    screen.server.thread = [{ ...answer, status: "sent" }, saved({ status: "delivered" }), earlier];
    await vi.advanceTimersByTimeAsync(QUIET_CHECK_EVERY_MS);
    expect(screen.asked).toEqual({ thread: 1, status: 1 });
    expect(screen.activity()).toBeNull();
    expect(cachedThread(screen.qc, CONVERSATION)?.[0].id).toBe("msg_answer");

    await vi.advanceTimersByTimeAsync(QUIET_WHILE_WORKING_MS);
    expect(screen.asked).toEqual({ thread: 2, status: 2 });
    // A ping: the connection is alive, nothing is asked.
    heardAt = Date.now();
    await vi.advanceTimersByTimeAsync(QUIET_WHILE_WORKING_MS - QUIET_CHECK_EVERY_MS);
    expect(screen.asked).toEqual({ thread: 2, status: 2 });
    stop();
    await vi.advanceTimersByTimeAsync(QUIET_WHILE_WORKING_MS * 3);
    expect(screen.asked).toEqual({ thread: 2, status: 2 });
    screen.close();
  });

  it("asks nothing while pings come every 25 seconds", () => {
    const now = START;
    expect(quietTooLong(now, now - 25_000, now - 60_000)).toBe(false);
    expect(quietTooLong(now, now - QUIET_WHILE_WORKING_MS, now - 60_000)).toBe(true);
    // Asked a moment ago: not again yet.
    expect(quietTooLong(now, now - 60_000, now - 10_000)).toBe(false);
  });
});
