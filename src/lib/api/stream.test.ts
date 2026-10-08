import { focusManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { qk } from "./hooks";
import { catchUpAfterReconnect } from "./stream";

// What a reconnect of the live stream asks the API for, with a real query cache: the lists on
// screen are stand-ins that count how often they are fetched.

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function screenWith(keys: readonly (readonly unknown[])[]) {
  // As the app sets it up (src/components/shell/providers.tsx).
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: false } } });
  qc.mount();
  const fetched = new Map<string, number>();
  const stops = keys.map((queryKey) => {
    const name = JSON.stringify(queryKey);
    const observer = new QueryObserver(qc, {
      queryKey,
      queryFn: async () => {
        fetched.set(name, (fetched.get(name) ?? 0) + 1);
        return { items: [] };
      },
    });
    return observer.subscribe(() => {});
  });
  qc.setQueryData(qk.agentProgress, [{ who: "scout", text: "reading 4 pages" }]);
  await settle();
  fetched.clear();
  const times = (key: readonly unknown[]) => fetched.get(JSON.stringify(key)) ?? 0;
  return { qc, times, close: () => stops.forEach((stop) => stop()) };
}

const LISTS = [qk.messages("all"), qk.approvals("pending"), qk.agentStatus] as const;
// Kept fresh by events too, but not asked for on a reconnect.
const OTHERS = [qk.credits, qk.automations] as const;

afterEach(() => focusManager.setFocused(undefined));

describe("catchUpAfterReconnect", () => {
  it("asks again for the lists the events keep fresh, since the stream replays nothing it missed", async () => {
    const screen = await screenWith([...LISTS, ...OTHERS]);
    catchUpAfterReconnect(screen.qc, true);
    await settle();
    for (const key of LISTS) expect(screen.times(key), JSON.stringify(key)).toBe(1);
    for (const key of OTHERS) expect(screen.times(key), JSON.stringify(key)).toBe(0);
    expect(screen.qc.getQueryData(qk.agentProgress)).toEqual([]);
    screen.close();
  });

  it("asks for nothing in a tab nobody is looking at, and catches up when the tab is shown again", async () => {
    const screen = await screenWith([...LISTS, ...OTHERS]);
    focusManager.setFocused(false);
    catchUpAfterReconnect(screen.qc, false);
    await settle();
    for (const key of [...LISTS, ...OTHERS]) expect(screen.times(key), JSON.stringify(key)).toBe(0);
    expect(screen.qc.getQueryData(qk.agentProgress)).toEqual([]);

    // Shown again well within 15 seconds of the last fetch: only what may have been missed is asked for.
    focusManager.setFocused(true);
    await settle();
    for (const key of LISTS) expect(screen.times(key), JSON.stringify(key)).toBe(1);
    for (const key of OTHERS) expect(screen.times(key), JSON.stringify(key)).toBe(0);
    screen.close();
  });
});
