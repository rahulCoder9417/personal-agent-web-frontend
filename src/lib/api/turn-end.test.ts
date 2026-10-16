import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { threadActivity } from "../chat-thread";
import type { AgentStatus, Message, StreamEvent } from "./client";
import { cachedThread, fetchAgentStatus, pageAfterCache, qk } from "./hooks";
import { applyStreamEvent, SETTLE_CHECK_MS } from "./stream";

// The end of a web chat turn, as the thread shows it. What happened on 16 October at 10:32 AM:
// "hlo" was sent, Tex answered "Hey! How can I help you today?", and the thread went on saying
// "Tex is on it" under the message and "Tex is working…" under the answer. The turn had ended
// (the message was saved `delivered`), but its last two events, the message `delivered` and the
// agent `awake`, never reached the page, and nothing else told it.

const CONVERSATION = "cnv_web";
const at = (second: number) => new Date(Date.UTC(2026, 9, 16, 5, 2, second)).toISOString();

function message(id: string, rest: Partial<Message> = {}): Message {
  return { id, conversationId: CONVERSATION, channel: "web", direction: "in", text: "hlo", status: "queued", approvalId: null, createdAt: at(15), ...rest };
}

const hlo = (status: Message["status"]) => message("msg_hlo", { status });
const reply = message("msg_reply", { direction: "out", text: "Hey! How can I help you today?", status: "queued", createdAt: at(23) });

/**
 * The chat screen with a real query cache: the open thread and the agent's state are watched, as
 * the thread watches them, and asking for them again gets what the API says now (`server`).
 */
function chatScreen() {
  const server = { thread: [hlo("queued")] as Message[], status: { state: "stopped", lastActiveAt: null } as AgentStatus };
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
  const send = (type: StreamEvent["type"], data: StreamEvent["data"]) => applyStreamEvent(qc, { type, data });
  const activity = () =>
    threadActivity({ status: qc.getQueryData<AgentStatus>(qk.agentStatus), messages: cachedThread(qc, CONVERSATION) ?? [], approval: undefined, answeredHere: false });
  const statusOf = (id: string) => cachedThread(qc, CONVERSATION)?.find((item) => item.id === id)?.status;
  return { qc, server, asked, send, activity, statusOf, close: () => stops.forEach((stop) => stop()) };
}

/** The turn up to Tex's answer, as the backend sends it. */
function turnUpToTheAnswer(screen: ReturnType<typeof chatScreen>) {
  screen.send("message.created", hlo("queued"));
  screen.send("agent.status", { state: "waking", lastActiveAt: null });
  screen.send("message.status", hlo("processing"));
  screen.send("agent.status", { state: "busy", lastActiveAt: at(19) });
  expect(screen.activity()).toBe("working");
  screen.send("message.created", reply);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the end of a turn whose last events never arrive", () => {
  it("asks again once Tex has answered, and the thread stops showing Tex at work", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.asked.thread = 0;
    screen.asked.status = 0;
    turnUpToTheAnswer(screen);
    // The turn ends on the server; its last two events are lost on the way.
    screen.server.thread = [{ ...reply, status: "sent" }, hlo("delivered")];
    screen.server.status = { state: "awake", lastActiveAt: at(25) };

    await vi.advanceTimersByTimeAsync(SETTLE_CHECK_MS - 1_000);
    expect(screen.activity()).toBe("working");
    expect(screen.statusOf("msg_hlo")).toBe("processing");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(screen.asked).toEqual({ thread: 1, status: 1 });
    expect(screen.activity()).toBeNull();
    expect(screen.statusOf("msg_hlo")).toBe("delivered");
    screen.close();
  });

  it("asks nothing when the turn's last events arrived", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.asked.thread = 0;
    screen.asked.status = 0;
    turnUpToTheAnswer(screen);
    screen.send("message.status", hlo("delivered"));
    screen.send("agent.status", { state: "awake", lastActiveAt: at(25) });
    expect(screen.activity()).toBeNull();

    await vi.advanceTimersByTimeAsync(SETTLE_CHECK_MS * 2);
    expect(screen.asked).toEqual({ thread: 0, status: 0 });
    screen.close();
  });

  it("keeps Tex at work when the API says the turn still runs (Tex said it is on it, and carries on)", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    turnUpToTheAnswer(screen);
    screen.server.thread = [{ ...reply, status: "sent" }, hlo("processing")];
    screen.server.status = { state: "busy", lastActiveAt: at(19) };

    await vi.advanceTimersByTimeAsync(SETTLE_CHECK_MS);
    expect(screen.activity()).toBe("working");
    screen.close();
  });

  it("asks nothing after a question of Tex's: the turn has paused for the person", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.asked.thread = 0;
    screen.asked.status = 0;
    screen.send("message.created", hlo("queued"));
    screen.send("message.status", hlo("processing"));
    screen.send("agent.status", { state: "busy", lastActiveAt: at(19) });
    screen.send("message.created", message("msg_card", { direction: "out", approvalId: "apr_1", createdAt: at(23) }));

    await vi.advanceTimersByTimeAsync(SETTLE_CHECK_MS * 2);
    expect(screen.asked).toEqual({ thread: 0, status: 0 });
    screen.close();
  });
});

describe("a late word for a turn that has ended", () => {
  it("never takes a delivered message back to 'Tex is on it'", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.send("message.created", hlo("queued"));
    screen.send("message.status", hlo("delivered"));
    screen.send("message.status", hlo("processing"));
    // Nor the answer to sending it, which says `queued`.
    screen.send("message.created", hlo("queued"));
    expect(screen.statusOf("msg_hlo")).toBe("delivered");
    // A status that moves on still does.
    screen.send("message.status", hlo("failed"));
    expect(screen.statusOf("msg_hlo")).toBe("failed");
    screen.close();
  });

  it("keeps what the events said when a list asked for during the turn is answered after its end", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    turnUpToTheAnswer(screen);
    screen.send("message.status", hlo("delivered"));
    screen.send("agent.status", { state: "awake", lastActiveAt: at(25) });
    // Read on the server while the turn ran.
    const page = pageAfterCache(screen.qc, CONVERSATION, { items: [reply, hlo("processing")], nextCursor: null });
    expect(page.items.map((item) => item.status)).toEqual(["queued", "delivered"]);
    screen.close();
  });

  it("keeps the agent's state from the stream when it changed while the API was being asked", async () => {
    const screen = chatScreen();
    await vi.advanceTimersByTimeAsync(0);
    screen.send("agent.status", { state: "busy", lastActiveAt: at(19) });
    let answer: (status: AgentStatus) => void = () => {};
    const asking = fetchAgentStatus(screen.qc, () => new Promise((resolve) => (answer = resolve)));
    // The turn ends while the answer, read during it, is on its way.
    screen.send("agent.status", { state: "awake", lastActiveAt: at(25) });
    answer({ state: "busy", lastActiveAt: at(19) });
    expect((await asking).state).toBe("awake");
    // Nothing said meanwhile: the API's answer is the newest.
    expect((await fetchAgentStatus(screen.qc, async () => ({ state: "stopped", lastActiveAt: at(30) }))).state).toBe("stopped");
    screen.close();
  });
});
