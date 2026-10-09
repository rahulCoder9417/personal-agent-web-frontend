import { focusManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { allConversations, type ConversationList } from "../conversations";
import type { Conversation, Message, StreamEvent } from "./client";
import { qk } from "./hooks";
import { applyStreamEvent, catchUpAfterReconnect } from "./stream";

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

const LISTS = [qk.thread("cnv_open"), qk.conversations, qk.approvals("pending"), qk.agentStatus] as const;
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

// Events about the chat, with a real query cache holding the history and two open threads.

const at = (hhmm: string) => `2026-10-08T${hhmm}:00.000Z`;

function conversation(id: string, last: string, rest: Partial<Conversation> = {}): Conversation {
  return { id, channel: "web", epoch: 0, startedAt: at("08:00"), lastMessageAt: at(last), title: `Chat ${id}`, active: false, ...rest };
}

function message(id: string, conversationId: string, hhmm: string, rest: Partial<Message> = {}): Message {
  return { id, conversationId, channel: "web", direction: "in", text: "hello", status: "queued", approvalId: null, createdAt: at(hhmm), ...rest };
}

type ThreadData = { pages: { items: Message[]; nextCursor: string | null }[]; pageParams: unknown[] };

function chatCache() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: false } } });
  const list: ConversationList = {
    pages: [{
      items: [conversation("cnv_now", "12:00", { active: true }), conversation("cnv_old", "09:00"), conversation("cnv_tg", "08:30", { channel: "telegram", active: true })],
      nextCursor: null,
    }],
    pageParams: [undefined],
  };
  qc.setQueryData(qk.conversations, list);
  const thread = (items: Message[]): ThreadData => ({ pages: [{ items, nextCursor: null }], pageParams: [undefined] });
  qc.setQueryData(qk.thread("cnv_now"), thread([message("m2", "cnv_now", "12:00"), message("m1", "cnv_now", "11:59")]));
  qc.setQueryData(qk.thread("cnv_old"), thread([message("m0", "cnv_old", "09:00", { status: "delivered" })]));

  const history = () => allConversations(qc.getQueryData<ConversationList>(qk.conversations));
  const threadIds = (id: string) => qc.getQueryData<ThreadData>(qk.thread(id))?.pages.flatMap((page) => page.items.map((item) => item.id));
  const send = (type: StreamEvent["type"], data: StreamEvent["data"]) => applyStreamEvent(qc, { type, data });
  return { qc, history, threadIds, send };
}

describe("applyStreamEvent, for the chat", () => {
  it("adds a new message to its own conversation's thread only, and moves that conversation to the top", () => {
    const chat = chatCache();
    chat.send("message.created", message("m3", "cnv_old", "12:30"));
    expect(chat.threadIds("cnv_old")).toEqual(["m3", "m0"]);
    expect(chat.threadIds("cnv_now")).toEqual(["m2", "m1"]);
    // Writing in an earlier web conversation makes it the active one.
    expect(chat.history().map((item) => [item.id, item.active])).toEqual([["cnv_old", true], ["cnv_now", false], ["cnv_tg", true]]);
  });

  it("changes a message's status in place, without reordering the history", () => {
    const chat = chatCache();
    chat.send("message.status", message("m0", "cnv_old", "09:00", { status: "failed" }));
    expect(chat.qc.getQueryData<ThreadData>(qk.thread("cnv_old"))?.pages[0].items[0].status).toBe("failed");
    expect(chat.history().map((item) => item.id)).toEqual(["cnv_now", "cnv_old", "cnv_tg"]);
  });

  it("keeps a Telegram message out of the web threads, and opens no thread nobody asked for", () => {
    const chat = chatCache();
    chat.send("message.created", message("m9", "cnv_tg", "12:40", { channel: "telegram" }));
    expect(chat.threadIds("cnv_now")).toEqual(["m2", "m1"]);
    expect(chat.threadIds("cnv_tg")).toBeUndefined();
    expect(chat.history().map((item) => item.id)).toEqual(["cnv_tg", "cnv_now", "cnv_old"]);
  });

  it("asks for the history again when a message belongs to a conversation it doesn't know", async () => {
    const chat = chatCache();
    chat.send("message.created", message("m9", "cnv_unknown", "12:40"));
    expect(chat.qc.getQueryState(qk.conversations)?.isInvalidated).toBe(true);
  });

  it("takes a renamed conversation and a new one from conversation.updated", () => {
    const chat = chatCache();
    chat.send("conversation.updated", conversation("cnv_old", "09:00", { title: "Offsite plans" }));
    expect(chat.history().map((item) => item.title)).toEqual(["Chat cnv_now", "Offsite plans", "Chat cnv_tg"]);

    chat.send("conversation.updated", conversation("cnv_new", "12:45", { active: true, title: "New chat" }));
    expect(chat.history().map((item) => [item.id, item.active])).toEqual([["cnv_new", true], ["cnv_now", false], ["cnv_old", false], ["cnv_tg", true]]);
  });

  it("removes a deleted conversation and its cached messages", () => {
    const chat = chatCache();
    chat.send("conversation.deleted", conversation("cnv_old", "09:00"));
    expect(chat.history().map((item) => item.id)).toEqual(["cnv_now", "cnv_tg"]);
    expect(chat.threadIds("cnv_old")).toBeUndefined();
    expect(chat.threadIds("cnv_now")).toEqual(["m2", "m1"]);
  });
});
