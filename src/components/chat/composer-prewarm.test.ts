// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The composer wakes Tex's workspace ahead of the message (POST /v1/agent/prewarm): when the chat
// opens and when typing starts, at most once a minute in all. Everything else goes to the demo
// backend. `openapi-fetch` keeps the `fetch` it finds when the client is made, so this is first.
const net = vi.hoisted(() => {
  const state = { handle: null as null | ((request: Request) => Promise<Response>), prewarms: 0 };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    if (request.method === "POST" && new URL(request.url).pathname === "/api/v1/agent/prewarm") state.prewarms += 1;
    return state.handle!(request);
  };
  return state;
});

vi.mock("@/components/toast", () => ({ toast: () => {}, toastError: () => {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { Composer } from "@/components/chat/composer";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { PREWARM_EVERY_MS } from "@/lib/prewarm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
/** The clock the prewarm reads; moved on by the tests (one minute between them). */
let now = Date.parse("2026-10-16T10:00:00Z");

beforeEach(() => {
  resetDemoStore(new Date("2026-10-01T14:30:00"));
  net.handle = (request) => handleDemoRequest(request, new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/"));
  net.prewarms = 0;
  now += 10 * PREWARM_EVERY_MS;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
});

async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => root!.render(createElement(QueryClientProvider, { client }, createElement(Composer))));
  await settle();
}

function close() {
  act(() => root!.unmount());
  root = null;
}

/** Types into the box as a person would (React reads the native value setter's change). */
async function type(value: string) {
  const box = host.querySelector("textarea")!;
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    set.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle(1);
}

describe("waking the workspace from the composer", () => {
  it("asks once when the chat opens; typing within the minute asks nothing more", async () => {
    await open();
    expect(net.prewarms).toBe(1);
    await type("h");
    await type("he");
    await type("");
    await type("w");
    expect(net.prewarms).toBe(1);
  });

  it("asks again when typing starts a minute or more later, once, not at every keystroke", async () => {
    await open();
    expect(net.prewarms).toBe(1);
    now += PREWARM_EVERY_MS;
    await type("c");
    expect(net.prewarms).toBe(2);
    await type("ch");
    await type("check my mail");
    expect(net.prewarms).toBe(2);
    // An empty box again, but still within the minute: nothing.
    await type("");
    await type("a");
    expect(net.prewarms).toBe(2);
  });

  it("opening the chat again within the minute asks nothing; after a minute it does", async () => {
    await open();
    close();
    await open();
    expect(net.prewarms).toBe(1);
    close();
    now += PREWARM_EVERY_MS;
    await open();
    expect(net.prewarms).toBe(2);
  });
});
