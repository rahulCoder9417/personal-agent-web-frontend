import { focusManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allConversations, showsUnread, type ConversationList } from "../conversations";
import { DRAFTS_KEY, type Drafts, NO_DRAFTS, SHOW_AFTER_MS, turnOnScreen } from "../drafts";
import type { Conversation, Message, MessageDraft, StreamEvent } from "./client";
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

describe("applyStreamEvent, for the unread mark", () => {
  /** The history from a backend that says `unread`: everything read so far, `cnv_now` open. */
  function withUnread() {
    const chat = chatCache();
    chat.qc.setQueryData<ConversationList>(qk.conversations, (list) => list && { ...list, pages: list.pages.map((page) => ({ ...page, items: page.items.map((item) => ({ ...item, unread: false })) })) });
    const marked = (openId: string | null) => chat.history().filter((item) => showsUnread(item, openId)).map((item) => item.id);
    return { ...chat, marked };
  }

  it("puts the dot on a conversation that isn't open when a reply from Tex arrives, before the backend's own word", () => {
    const chat = withUnread();
    chat.send("message.created", message("m9", "cnv_tg", "12:40", { channel: "telegram", direction: "out", text: "Moved it." }));
    expect(chat.marked("cnv_now")).toEqual(["cnv_tg"]);
    expect(chat.history()[0]).toMatchObject({ id: "cnv_tg", unread: true });
    // The backend's conversation.updated says the same, and the dot stays.
    chat.send("conversation.updated", conversation("cnv_tg", "12:40", { channel: "telegram", active: true, unread: true }));
    expect(chat.marked("cnv_now")).toEqual(["cnv_tg"]);
  });

  it("never shows it on the open conversation, and takes it away when the backend says it was read", () => {
    const chat = withUnread();
    chat.send("message.created", message("m3", "cnv_now", "12:30", { direction: "out" }));
    expect(chat.history()[0]).toMatchObject({ id: "cnv_now", unread: true });
    expect(chat.marked("cnv_now")).toEqual([]);
    // Read on another device: the event clears it here too.
    chat.send("conversation.updated", conversation("cnv_now", "12:30", { active: true, unread: false }));
    expect(chat.marked(null)).toEqual([]);
  });

  it("is cleared by the person's own message in that conversation", () => {
    const chat = withUnread();
    chat.send("message.created", message("m9", "cnv_old", "12:40", { direction: "out" }));
    expect(chat.marked("cnv_now")).toEqual(["cnv_old"]);
    chat.send("message.created", message("m10", "cnv_old", "12:41", { direction: "in" }));
    expect(chat.marked("cnv_now")).toEqual([]);
  });

  it("makes up nothing for an older backend, which never says unread", () => {
    const chat = chatCache();
    chat.send("message.created", message("m9", "cnv_tg", "12:40", { channel: "telegram", direction: "out" }));
    expect(chat.history()[0].unread).toBeUndefined();
    expect(chat.history().filter((item) => showsUnread(item, "cnv_now"))).toEqual([]);
  });

  it("marks the Automations chat when a run arrives, from a backend that says unread", () => {
    const chat = withUnread();
    chat.qc.setQueryData(qk.automationsChat, conversation("cnv_auto", "07:00", { kind: "automations", title: "Automations", unread: false }));
    chat.send("message.created", message("r1", "cnv_auto", "12:50", { direction: "out" }));
    expect(chat.qc.getQueryData<Conversation | null>(qk.automationsChat)).toMatchObject({ unread: true, lastMessageAt: at("12:50") });
  });
});

describe("applyStreamEvent, for the Automations chat", () => {
  const pinned = (rest: Partial<Conversation> = {}) => conversation("cnv_auto", "07:00", { kind: "automations", title: "Automations", ...rest });
  const pinnedNow = (qc: QueryClient) => qc.getQueryData<Conversation | null>(qk.automationsChat);

  it("keeps it pinned apart: a new run moves it on, never into the dated list, and never makes it active", () => {
    const chat = chatCache();
    chat.qc.setQueryData(qk.automationsChat, pinned());
    chat.qc.setQueryData(qk.thread("cnv_auto"), { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });

    chat.send("message.created", message("r1", "cnv_auto", "12:50", { direction: "out", text: "Your meetings today: …" }));
    expect(chat.threadIds("cnv_auto")).toEqual(["r1"]);
    expect(pinnedNow(chat.qc)).toMatchObject({ id: "cnv_auto", lastMessageAt: at("12:50"), active: false });
    expect(chat.history().map((item) => item.id)).toEqual(["cnv_now", "cnv_old", "cnv_tg"]);
    // The dated list was not asked for again: the conversation is known.
    expect(chat.qc.getQueryState(qk.conversations)?.isInvalidated).toBe(false);

    // The person writes in it: it is still not the active one, and the active web chat stays.
    chat.send("message.created", message("r2", "cnv_auto", "12:55", { text: "Which can move?" }));
    expect(pinnedNow(chat.qc)).toMatchObject({ lastMessageAt: at("12:55"), active: false });
    expect(chat.history().map((item) => [item.id, item.active])).toEqual([["cnv_now", true], ["cnv_old", false], ["cnv_tg", true]]);
  });

  it("takes it from conversation.updated (started by a first run), and drops it on conversation.deleted", () => {
    const chat = chatCache();
    chat.qc.setQueryData(qk.automationsChat, null);
    chat.send("conversation.updated", pinned({ lastMessageAt: at("12:58") }));
    expect(pinnedNow(chat.qc)).toMatchObject({ id: "cnv_auto", kind: "automations" });
    expect(chat.history().map((item) => item.id)).toEqual(["cnv_now", "cnv_old", "cnv_tg"]);

    chat.send("conversation.deleted", pinned());
    expect(pinnedNow(chat.qc)).toBeNull();
    expect(chat.history().map((item) => item.id)).toEqual(["cnv_now", "cnv_old", "cnv_tg"]);
  });
});

describe("applyStreamEvent, for the answer as it is written", () => {
  const draft = (text: string, rest: Partial<MessageDraft> = {}): MessageDraft => ({
    conversationId: "cnv_now",
    turnId: "evt_1",
    messageId: "m2",
    text,
    at: at("12:01"),
    ...rest,
  });
  const drafts = (qc: QueryClient) => qc.getQueryData<Drafts>(DRAFTS_KEY) ?? NO_DRAFTS;
  const shown = (qc: QueryClient, id = "cnv_now") => turnOnScreen(drafts(qc), id)?.writing ?? undefined;
  const steps = (qc: QueryClient, id = "cnv_now") => turnOnScreen(drafts(qc), id)?.steps.map((step) => step.text);
  const LONG = "Here are your meetings for today, with who is in each one and what you might want to prepare.";
  const MORE = "And two emails from Maya ask about tomorrow’s review: she wants the numbers and a time that suits you.";

  afterEach(() => vi.useRealTimers());

  it("shows the latest draft in its conversation, and Tex's answer in its place", () => {
    const chat = chatCache();
    chat.send("message.draft", draft("Here are your meetings for today,"));
    chat.send("message.draft", draft(LONG));
    expect(shown(chat.qc)).toBe(LONG);
    expect(shown(chat.qc, "cnv_old")).toBeUndefined();
    // The answer arrives: it joins the thread, and the draft goes.
    chat.send("message.created", message("m3", "cnv_now", "12:02", { direction: "out", text: `${LONG} …` }));
    expect(chat.threadIds("cnv_now")).toEqual(["m3", "m2", "m1"]);
    expect(shown(chat.qc)).toBeUndefined();
    // The turn's last draft, overtaken by the answer on the way, is not shown again.
    chat.send("message.draft", draft(`${LONG} …`));
    expect(shown(chat.qc)).toBeUndefined();
    // Nothing of it was saved as a message.
    expect(chat.threadIds("cnv_now")).toEqual(["m3", "m2", "m1"]);
  });

  it("holds back a short draft until it has been written for 1.2 seconds without starting over", () => {
    vi.useFakeTimers();
    const chat = chatCache();
    chat.send("message.draft", draft("Let me check your calendar."));
    vi.advanceTimersByTime(700);
    chat.send("message.draft", draft(""));
    vi.advanceTimersByTime(1000);
    expect(drafts(chat.qc).turns.cnv_now).toMatchObject({ run: null, steps: [] });

    chat.send("message.draft", draft("Sure"));
    vi.advanceTimersByTime(SHOW_AFTER_MS - 1);
    expect(shown(chat.qc)).toBeUndefined();
    chat.send("message.draft", draft("Sure, one"));
    vi.advanceTimersByTime(1);
    expect(shown(chat.qc)).toBe("Sure, one");
  });

  it("keeps a shown draft as a step when Tex starts over, with what it went on to do, and folds the steps into the answer", () => {
    const chat = chatCache();
    chat.send("message.draft", draft(LONG));
    chat.send("message.draft", draft(""));
    chat.send("agent.progress", { text: "using Google Calendar", crew: null, at: at("12:01") });
    chat.send("message.draft", draft(MORE));
    expect(steps(chat.qc)).toEqual([LONG]);
    expect(turnOnScreen(drafts(chat.qc), "cnv_now")?.steps[0].progress.map((line) => line.text)).toEqual(["using Google Calendar"]);
    expect(shown(chat.qc)).toBe(MORE);

    chat.send("message.created", message("m3", "cnv_now", "12:02", { direction: "out", text: MORE }));
    expect(steps(chat.qc)).toBeUndefined();
    expect(drafts(chat.qc).folded.m3.map((step) => step.text)).toEqual([LONG]);
  });

  it("keeps the steps when the turn fails, until the apology arrives", () => {
    const chat = chatCache();
    chat.send("message.draft", draft(LONG));
    chat.send("message.draft", draft(""));
    chat.send("message.status", message("m2", "cnv_now", "12:00", { status: "failed" }));
    chat.send("agent.status", { state: "awake", lastActiveAt: at("12:03") });
    expect(steps(chat.qc)).toEqual([LONG]);
    chat.send("message.created", message("m3", "cnv_now", "12:03", { direction: "out", text: "I couldn't finish that." }));
    expect(steps(chat.qc)).toBeUndefined();
    expect(drafts(chat.qc).folded.m3.map((step) => step.text)).toEqual([LONG]);
  });

  it("keeps what is on screen after a reconnect while the agent is at work, and ends the turn if it is not", async () => {
    const chat = chatCache();
    chat.send("agent.status", { state: "busy", lastActiveAt: at("12:01") });
    chat.send("message.draft", draft(LONG));
    catchUpAfterReconnect(chat.qc, true);
    await settle();
    expect(shown(chat.qc), "still at work").toBe(LONG);
    // The next draft carries on from it.
    chat.send("message.draft", draft(`${LONG} More.`));
    expect(shown(chat.qc)).toBe(`${LONG} More.`);

    // The turn ended while the stream was down: what was shown stays, as a step, until its answer.
    chat.qc.setQueryData(qk.agentStatus, { state: "awake", lastActiveAt: at("12:03") });
    catchUpAfterReconnect(chat.qc, true);
    await settle();
    expect(shown(chat.qc)).toBeUndefined();
    expect(steps(chat.qc)).toEqual([`${LONG} More.`]);
  });
});
