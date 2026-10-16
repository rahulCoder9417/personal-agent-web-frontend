import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "./client";
import { qk } from "./hooks";
import { connectLive, type LiveBrowser, type LiveSource, REOPEN_FIRST_MS, SILENT_MS, WATCH_EVERY_MS } from "./stream";

// The live connection (`connectLive`) with a stand-in for the browser's EventSource. The backend
// writes `ready` as a connection opens (`resumed` when it sends what this tab missed first), then
// the events, each with an id but drafts, and a `ping` after 25 seconds without one.

class FakeSource {
  readyState = 0;
  closed = false;
  /** The id of the last event this connection was given, as the browser keeps it. */
  lastEventId = "";
  constructor(readonly openedWith?: string) {}
  private listeners = new Map<string, Set<(event: { data: string; lastEventId: string }) => void>>();
  addEventListener(type: string, listener: (event: { data: string; lastEventId: string }) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data: unknown = {}, id?: string) {
    if (type === "ready") this.readyState = 1;
    if (id) this.lastEventId = id;
    for (const listener of this.listeners.get(type) ?? [])
      listener({ data: JSON.stringify(data), lastEventId: this.lastEventId });
  }
  /** The proxy answered 401 or 502: the browser gives the connection up for good. */
  refuse() {
    this.readyState = 2;
    this.emit("error");
  }
}

function page(visible = true) {
  const sources: FakeSource[] = [];
  let onShow: () => void = () => {};
  const state = { visible };
  const browser: LiveBrowser = {
    open: (lastEventId) => {
      const source = new FakeSource(lastEventId);
      sources.push(source);
      return source as unknown as LiveSource;
    },
    visible: () => state.visible,
    onVisibility: (listener) => {
      onShow = listener;
      return () => {};
    },
  };
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: false } } });
  qc.mount();
  // The agent's state is on screen; asking for it again counts.
  let asked = 0;
  const stop = new QueryObserver(qc, {
    queryKey: qk.agentStatus,
    queryFn: async (): Promise<AgentStatus> => {
      asked++;
      return { state: "awake", lastActiveAt: null };
    },
  }).subscribe(() => {});
  const close = connectLive(qc, browser);
  return {
    qc,
    sources,
    latest: () => sources[sources.length - 1],
    asked: () => asked,
    show: () => {
      state.visible = true;
      onShow();
    },
    hide: () => {
      state.visible = false;
      onShow();
    },
    close: () => {
      close();
      stop();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the live connection", () => {
  it("keeps a connection the backend pings", async () => {
    const screen = page();
    screen.latest().emit("ready");
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(25_000);
      screen.latest().emit("ping");
    }
    expect(screen.sources).toHaveLength(1);
    screen.close();
  });

  it("replaces a connection that has gone silent, and the new one catches up on what was missed", async () => {
    const screen = page();
    await vi.advanceTimersByTimeAsync(0);
    screen.latest().emit("ready");
    screen.latest().emit("agent.status", { type: "agent.status", data: { state: "busy", lastActiveAt: null } });
    const before = screen.asked();
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("busy");

    // Open in the browser, but nothing comes any more: not the turn's end, not even a ping.
    await vi.advanceTimersByTimeAsync(SILENT_MS + WATCH_EVERY_MS);
    expect(screen.sources).toHaveLength(2);
    expect(screen.sources[0].closed).toBe(true);

    screen.latest().emit("ready");
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.asked()).toBe(before + 1);
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("awake");
    screen.close();
  });

  it("a new connection gives the last event's id; when the backend resumed, nothing is asked again", async () => {
    const screen = page();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.latest().openedWith).toBeUndefined();
    screen.latest().emit("ready", { resumed: false });
    screen.latest().emit("agent.status", { type: "agent.status", data: { state: "busy", lastActiveAt: null } }, "17-0");
    // A draft has no id: the last id stays the agent's state's.
    screen.latest().emit("message.draft", { type: "message.draft", data: { conversationId: "c", turnId: "t", messageId: null, text: "Hi", at: "2026-10-16T10:00:00Z" } });
    const before = screen.asked();

    await vi.advanceTimersByTimeAsync(SILENT_MS + WATCH_EVERY_MS);
    expect(screen.sources).toHaveLength(2);
    expect(screen.latest().openedWith).toBe("17-0");
    screen.latest().emit("ready", { resumed: true });
    await vi.advanceTimersByTimeAsync(0);
    // Nothing was missed: no list is asked for again, and what the events said stays.
    expect(screen.asked()).toBe(before);
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("busy");
    // What the backend replays is folded in like any event.
    screen.latest().emit("agent.status", { type: "agent.status", data: { state: "awake", lastActiveAt: null } }, "18-0");
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("awake");
    screen.close();
  });

  it("catches up when the backend could not resume (away too long)", async () => {
    const screen = page();
    await vi.advanceTimersByTimeAsync(0);
    screen.latest().emit("ready", { resumed: false });
    screen.latest().emit("agent.status", { type: "agent.status", data: { state: "busy", lastActiveAt: null } }, "17-0");
    const before = screen.asked();
    await vi.advanceTimersByTimeAsync(SILENT_MS + WATCH_EVERY_MS);
    expect(screen.latest().openedWith).toBe("17-0");
    screen.latest().emit("ready", { resumed: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.asked()).toBe(before + 1);
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).toBe("awake");
    screen.close();
  });

  it("ignores what a replaced connection still delivers", async () => {
    const screen = page();
    const first = screen.latest();
    first.emit("ready");
    await vi.advanceTimersByTimeAsync(SILENT_MS + WATCH_EVERY_MS);
    screen.latest().emit("ready");
    first.emit("agent.status", { type: "agent.status", data: { state: "busy", lastActiveAt: null } });
    expect(screen.qc.getQueryData<AgentStatus>(qk.agentStatus)?.state).not.toBe("busy");
    screen.close();
  });

  it("opens a refused connection again, later each time, and catches up once it opens", async () => {
    const screen = page();
    screen.latest().emit("ready");
    screen.latest().refuse();
    expect(screen.sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(REOPEN_FIRST_MS);
    expect(screen.sources).toHaveLength(2);
    screen.latest().refuse();
    await vi.advanceTimersByTimeAsync(REOPEN_FIRST_MS);
    expect(screen.sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(REOPEN_FIRST_MS);
    expect(screen.sources).toHaveLength(3);
    const before = screen.asked();
    screen.latest().emit("ready");
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.asked()).toBe(before + 1);
    screen.close();
  });

  it("leaves the browser's own retry alone after a dropped connection", async () => {
    const screen = page();
    screen.latest().emit("ready");
    // Dropped: the browser is reconnecting by itself (CONNECTING), and says `ready` again.
    screen.latest().readyState = 0;
    screen.latest().emit("error");
    await vi.advanceTimersByTimeAsync(REOPEN_FIRST_MS * 4);
    expect(screen.sources).toHaveLength(1);
    screen.close();
  });

  it("looks at once when the page is shown again after a long time away", async () => {
    const screen = page();
    screen.latest().emit("ready");
    screen.hide();
    // Timers of a page put away may not run for minutes: the watch didn't get to look.
    vi.setSystemTime(Date.now() + SILENT_MS + 1_000);
    screen.show();
    expect(screen.sources).toHaveLength(2);
    screen.close();
  });

  it("closes its connection when the app goes", () => {
    const screen = page();
    screen.close();
    expect(screen.latest().closed).toBe(true);
  });
});
