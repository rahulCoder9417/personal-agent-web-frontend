// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The conversation on screen is marked read: when it is opened, and when a reply arrives in it
// while it is shown, but only while the page is on screen. The requests go to the demo backend,
// which answers as the real one would.

// The page's requests, handed to the demo backend. `openapi-fetch` keeps the `fetch` it finds when
// the client is made, so this is in place before anything is imported.
const net = vi.hoisted(() => {
  const state = { handle: null as null | ((request: Request) => Promise<Response>), reads: [] as string[] };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path.endsWith("/read")) state.reads.push(path);
    return state.handle!(request);
  };
  return state;
});

import type { Conversation } from "@/lib/api/client";
import { qk, useConversations } from "@/lib/api/hooks";
import { applyStreamEvent } from "@/lib/api/stream";
import { allConversations, type ConversationList } from "@/lib/conversations";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { getStore } from "@/lib/demo/store";
import { useReadWhileShown } from "./read-while-shown";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let qc: QueryClient;
let visibility: DocumentVisibilityState = "visible";

/** The chat's list, with one conversation shown, as the chat screen has it. */
function Shown({ openId }: { openId: string }) {
  const list = useConversations();
  const open = allConversations(list.data).find((conversation) => conversation.id === openId) ?? null;
  useReadWhileShown(open?.id ?? null, open?.unread === true);
  return null;
}

async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const cached = (id: string) => allConversations(qc.getQueryData<ConversationList>(qk.conversations)).find((item) => item.id === id);
const demo = (id: string) => getStore().conversations.find((item) => item.id === id);

function show(openId: string) {
  act(() => root.render(createElement(QueryClientProvider, { client: qc }, createElement(Shown, { openId }))));
}

function setVisible(next: DocumentVisibilityState) {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  resetDemoStore(new Date("2026-10-01T14:30:00"));
  net.handle = (request) => handleDemoRequest(request, new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/"));
  net.reads = [];
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  qc.clear();
});

describe("useReadWhileShown", () => {
  it("marks an unread conversation read when it is opened, here and at the backend, once", async () => {
    expect(demo("cnv_tg_1")?.unread).toBe(true);
    show("cnv_tg_1");
    await settle();
    expect(net.reads).toEqual(["/api/v1/conversations/cnv_tg_1/read"]);
    expect(cached("cnv_tg_1")?.unread).toBe(false);
    expect(demo("cnv_tg_1")?.unread).toBe(false);
  });

  it("asks nothing for a conversation that is read already", async () => {
    show("cnv_web_1");
    await settle();
    expect(cached("cnv_web_1")?.unread).toBe(false);
    expect(net.reads).toEqual([]);
  });

  it("marks a reply that arrives while it is shown read too", async () => {
    show("cnv_web_1");
    await settle();
    const reply = { id: "msg_new", conversationId: "cnv_web_1", channel: "web", direction: "out", text: "Done.", status: "sent", approvalId: null, createdAt: new Date().toISOString() } as const;
    // As the live stream brings it: the message, then the backend's word that it is unread.
    getStore().conversations.find((item) => item.id === "cnv_web_1")!.unread = true;
    act(() => {
      applyStreamEvent(qc, { type: "message.created", data: reply });
      applyStreamEvent(qc, { type: "conversation.updated", data: { ...cached("cnv_web_1")!, lastMessageAt: reply.createdAt, unread: true } satisfies Conversation });
    });
    await settle();
    expect(net.reads).toEqual(["/api/v1/conversations/cnv_web_1/read"]);
    expect(cached("cnv_web_1")?.unread).toBe(false);
    expect(demo("cnv_web_1")?.unread).toBe(false);
  });

  it("waits while the page isn't on screen, and marks it read when it is shown again", async () => {
    visibility = "hidden";
    show("cnv_tg_1");
    await settle();
    expect(net.reads).toEqual([]);
    expect(cached("cnv_tg_1")?.unread).toBe(true);

    setVisible("visible");
    await settle();
    expect(net.reads).toEqual(["/api/v1/conversations/cnv_tg_1/read"]);
    expect(cached("cnv_tg_1")?.unread).toBe(false);
  });

  it("asks nothing of an older backend, which never says a conversation is unread", async () => {
    for (const conversation of getStore().conversations) delete conversation.unread;
    show("cnv_tg_1");
    await settle();
    expect(cached("cnv_tg_1")?.unread).toBeUndefined();
    expect(net.reads).toEqual([]);
  });
});
