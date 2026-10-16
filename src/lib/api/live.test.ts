import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "./client";
import { qk } from "./hooks";
import { connectLive, type LiveBrowser, type LiveSource, REOPEN_FIRST_MS, SILENT_MS, WATCH_EVERY_MS } from "./stream";

// The live connection (`connectLive`) with a stand-in for the browser's EventSource. The backend
// writes `ready` as a connection opens, then the events, and a `ping` after 25 seconds without one.

class FakeSource {
  readyState = 0;
  closed = false;
  private listeners = new Map<string, Set<(event: { data: string }) => void>>();
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data: unknown = {}) {
    if (type === "ready") this.readyState = 1;
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
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
    open: () => {
      const source = new FakeSource();
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
