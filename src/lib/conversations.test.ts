import { describe, expect, it } from "vitest";
import { ApiError, type Conversation } from "./api/client";
import {
  activeWebConversation,
  allConversations,
  automationsChatIn,
  automationsChatSpoke,
  automationsUnread,
  canWriteIn,
  conversationSpoke,
  conversationStartedBy,
  conversationToOpen,
  dropConversation,
  emptyActiveChat,
  isAutomationsChat,
  lastSpokenAt,
  newChatError,
  placeConversation,
  readOnlyNote,
  seenToRemember,
  serverHasAutomationsChat,
  titleOf,
  titleToSave,
  anyUnread,
  changeConversation,
  readMarked,
  showsUnread,
  unreadAfter,
  type ConversationList,
} from "./conversations";

const at = (hhmm: string) => `2026-10-08T${hhmm}:00.000Z`;

function conversation(id: string, last: string, rest: Partial<Conversation> = {}): Conversation {
  return { id, channel: "web", epoch: 0, startedAt: at("08:00"), lastMessageAt: at(last), title: `Chat ${id}`, active: false, ...rest };
}

/** A cached list: each inner array is a page, newest first; `more` says a further page is still to load. */
function listOf(pages: Conversation[][], more = false): ConversationList {
  return {
    pages: pages.map((items, index) => ({ items, nextCursor: index < pages.length - 1 || more ? `cursor_${index}` : null })),
    pageParams: pages.map((_, index) => (index === 0 ? undefined : `cursor_${index - 1}`)),
  };
}

const ids = (list: ConversationList) => list.pages.map((page) => page.items.map((item) => item.id));

describe("what a conversation is called", () => {
  it("shows its title, and New chat for one without", () => {
    expect(titleOf({ title: "Move my 3pm with Maya" })).toBe("Move my 3pm with Maya");
    expect(titleOf({ title: "  " })).toBe("New chat");
  });

  it("saves a new name tidied up, and nothing when it is empty, too long or unchanged", () => {
    expect(titleToSave("  Offsite   plans ", "Chat a")).toBe("Offsite plans");
    expect(titleToSave("   ", "Chat a")).toBeNull();
    expect(titleToSave("Chat a ", "Chat a")).toBeNull();
    expect(titleToSave("x".repeat(80), "Chat a")).toHaveLength(80);
    expect(titleToSave("x".repeat(81), "Chat a")).toBeNull();
  });

  it("takes when it started as its time until something is said", () => {
    expect(lastSpokenAt(conversation("a", "09:30"))).toBe(at("09:30"));
    // The contract always sends `lastMessageAt`; an empty one is read the same way if it ever doesn't.
    expect(lastSpokenAt({ startedAt: at("08:00"), lastMessageAt: null as unknown as string })).toBe(at("08:00"));
  });
});

describe("which conversation the chat shows", () => {
  const telegram = conversation("tg", "12:00", { channel: "telegram", active: true });
  const earlier = conversation("old", "09:00");
  const active = conversation("now", "11:00", { active: true });
  const all = [telegram, active, earlier];

  it("opens on the active web conversation, not on a newer one from Telegram", () => {
    expect(activeWebConversation(all)).toBe(active);
    expect(conversationToOpen(all, null, true)).toBe(active);
  });

  it("shows the one the person picked, and goes back to the active one once that is deleted", () => {
    expect(conversationToOpen(all, "old", true)).toBe(earlier);
    expect(conversationToOpen(all, "tg", true)).toBe(telegram);
    expect(conversationToOpen([telegram, active], "old", true)).toBe(active);
  });

  it("has nothing to show before the first web conversation, and the newest to read when web chat is off", () => {
    expect(conversationToOpen([telegram], null, true)).toBeNull();
    expect(conversationToOpen([], null, true)).toBeNull();
    expect(conversationToOpen(all, null, false)).toBe(telegram);
    expect(conversationToOpen([], null, false)).toBeNull();
  });

  it("lets the person write in a web conversation only", () => {
    expect(canWriteIn(active)).toBe(true);
    expect(canWriteIn(earlier)).toBe(true);
    // Nothing open yet: the first message starts the web chat.
    expect(canWriteIn(null)).toBe(true);
    expect(canWriteIn(telegram)).toBe(false);
    expect(readOnlyNote("telegram")).toBe("Reply on Telegram to continue this chat");
  });
});

describe("a new chat", () => {
  const active = conversation("now", "11:00", { active: true, title: "New chat" });
  const all = [conversation("tg", "12:00", { channel: "telegram", active: true }), active, conversation("old", "09:00")];

  it("opens the active web conversation again when nothing has been said in it", () => {
    expect(emptyActiveChat(all, (id) => id === "now")).toBe(active);
  });

  it("starts another one when the active one has messages, or isn't known to be empty", () => {
    expect(emptyActiveChat(all, () => false)).toBeNull();
    expect(emptyActiveChat(all, () => undefined)).toBeNull();
    expect(emptyActiveChat([conversation("old", "09:00")], () => true)).toBeNull();
  });

  it("says the hourly limit in words, and passes other errors on", () => {
    expect(newChatError(new ApiError(429, "rate_limited", "Too many requests"))).toContain("new chats in an hour");
    expect(newChatError(new ApiError(0, "network", "You seem to be offline."))).toBe("You seem to be offline.");
  });
});

describe("the cached list", () => {
  const a = conversation("a", "12:00", { active: true });
  const b = conversation("b", "11:00");
  const c = conversation("c", "10:00");
  const d = conversation("d", "09:00");

  it("lists every conversation loaded once, in order", () => {
    expect(allConversations(undefined)).toEqual([]);
    expect(allConversations(listOf([[a, b], [b, c]])).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("puts a new conversation at the top and makes it the only active web conversation", () => {
    const next = placeConversation(listOf([[a, b], [c, d]]), conversation("new", "12:30", { active: true }));
    expect(ids(next)).toEqual([["new", "a", "b"], ["c", "d"]]);
    expect(allConversations(next).filter((item) => item.active).map((item) => item.id)).toEqual(["new"]);
  });

  it("leaves a Telegram conversation active when a web one becomes active", () => {
    const telegram = conversation("tg", "12:10", { channel: "telegram", active: true });
    const next = placeConversation(listOf([[telegram, a, b]]), { ...b, active: true });
    expect(allConversations(next).filter((item) => item.active).map((item) => item.id)).toEqual(["tg", "b"]);
  });

  it("keeps a renamed conversation where it is", () => {
    const next = placeConversation(listOf([[a, b], [c, d]]), { ...c, title: "Offsite plans" });
    expect(ids(next)).toEqual([["a", "b"], ["c", "d"]]);
    expect(allConversations(next)[2].title).toBe("Offsite plans");
  });

  it("moves a conversation up when something is said in it, also from a later page", () => {
    const next = placeConversation(listOf([[a, b], [c, d]]), { ...d, lastMessageAt: at("11:30") });
    expect(ids(next)).toEqual([["a", "d", "b"], ["c"]]);
  });

  it("leaves out one older than everything loaded while more is to come, and adds it at the end otherwise", () => {
    const old = conversation("old", "07:00");
    expect(ids(placeConversation(listOf([[a, b]], true), old))).toEqual([["a", "b"]]);
    expect(ids(placeConversation(listOf([[a, b]]), old))).toEqual([["a", "b", "old"]]);
  });

  it("never loses one that was listed, even with more to come", () => {
    // Its time went back (it shouldn't): it stays, at the end of what is loaded.
    expect(ids(placeConversation(listOf([[a, b]], true), { ...a, lastMessageAt: at("07:00") }))).toEqual([["b", "a"]]);
  });

  it("does nothing to a list that hasn't been loaded", () => {
    const empty: ConversationList = { pages: [], pageParams: [] };
    expect(placeConversation(empty, a)).toBe(empty);
  });

  it("drops a deleted conversation, and leaves the list alone when it isn't there", () => {
    const list = listOf([[a, b], [c, d]]);
    const next = dropConversation(list, "c");
    expect(ids(next)).toEqual([["a", "b"], ["d"]]);
    // It wasn't the active one, so the active one stays.
    expect(activeWebConversation(allConversations(next))?.id).toBe("a");
    expect(dropConversation(list, "nope")).toBe(list);
  });

  it("makes the newest web conversation left the active one when the active one is deleted", () => {
    const telegram = conversation("tg", "11:30", { channel: "telegram", active: true });
    const next = dropConversation(listOf([[a, telegram, b], [c]]), "a");
    expect(allConversations(next).map((item) => [item.id, item.active])).toEqual([["tg", true], ["b", true], ["c", false]]);
    // With no web conversation left there is none to write in until the backend starts one.
    expect(activeWebConversation(allConversations(dropConversation(listOf([[a, telegram]]), "a")))).toBeUndefined();
    // Deleting Telegram's latest conversation changes nothing for the web chat.
    expect(allConversations(dropConversation(listOf([[a, telegram, b]]), "tg")).map((item) => [item.id, item.active])).toEqual([["a", true], ["b", false]]);
  });

  it("stands in for the conversation a first message started until the backend describes it", () => {
    const started = conversationStartedBy({ conversationId: "cnv_first", channel: "web", createdAt: at("13:00") });
    expect(started).toEqual({ id: "cnv_first", channel: "web", kind: "chat", epoch: 0, startedAt: at("13:00"), lastMessageAt: at("13:00"), title: "New chat", active: true });
    const next = placeConversation(listOf([[conversation("tg", "12:00", { channel: "telegram", active: true })]]), started);
    expect(conversationToOpen(allConversations(next), null, true)?.id).toBe("cnv_first");
  });
});

describe("a message saved in a conversation", () => {
  const a = conversation("a", "12:00", { active: true });
  const b = conversation("b", "11:00");
  const telegram = conversation("tg", "10:00", { channel: "telegram", active: true });
  const list = listOf([[a, b, telegram]]);
  const message = (conversationId: string, hhmm: string, rest: { channel?: "web" | "telegram"; direction?: "in" | "out" } = {}) => ({
    conversationId, createdAt: at(hhmm), channel: rest.channel ?? ("web" as const), direction: rest.direction ?? ("in" as const),
  });

  it("moves the conversation to the top, and writing in an earlier web conversation makes it the active one", () => {
    const next = conversationSpoke(list, message("b", "12:30"));
    expect(next && ids(next)).toEqual([["b", "a", "tg"]]);
    expect(next && allConversations(next).map((item) => [item.id, item.active])).toEqual([["b", true], ["a", false], ["tg", true]]);
    expect(next && allConversations(next)[0].lastMessageAt).toBe(at("12:30"));
  });

  it("moves it up without changing which web conversation is active when Tex or Telegram spoke", () => {
    const reply = conversationSpoke(list, message("b", "12:30", { direction: "out" }));
    expect(reply && allConversations(reply).map((item) => [item.id, item.active])).toEqual([["b", false], ["a", true], ["tg", true]]);
    const fromTelegram = conversationSpoke(list, message("tg", "12:30", { channel: "telegram" }));
    expect(fromTelegram && ids(fromTelegram)).toEqual([["tg", "a", "b"]]);
    expect(fromTelegram && activeWebConversation(allConversations(fromTelegram))?.id).toBe("a");
  });

  it("changes nothing for a message the list already knows about", () => {
    expect(conversationSpoke(list, message("a", "12:00"))).toBe(list);
    expect(conversationSpoke(list, message("b", "10:30"))).toBe(list);
  });

  it("says so when the conversation isn't in the list, so it is asked for", () => {
    expect(conversationSpoke(list, message("unknown", "12:30"))).toBeNull();
  });
});

describe("the Automations chat", () => {
  const pinned = (last: string, rest: Partial<Conversation> = {}) => conversation("auto", last, { kind: "automations", title: "Automations", startedAt: at("07:00"), ...rest });

  it("is known by its kind; an older backend's conversations have none and are chats", () => {
    expect(isAutomationsChat(pinned("09:00"))).toBe(true);
    expect(isAutomationsChat(conversation("a", "09:00", { kind: "chat" }))).toBe(false);
    expect(isAutomationsChat(conversation("a", "09:00"))).toBe(false);
    expect(isAutomationsChat(null)).toBe(false);
  });

  it("is found by its own kind, so an older backend that ignores the filter doesn't make an ordinary chat of it", () => {
    expect(automationsChatIn([pinned("09:00")])?.id).toBe("auto");
    expect(automationsChatIn([])).toBeNull();
    // An older backend lists every conversation, newest first, and says no kind.
    expect(automationsChatIn([conversation("a", "10:00", { active: true }), conversation("b", "09:00")])).toBeNull();
    expect(automationsChatIn([conversation("a", "10:00", { kind: "chat" }), pinned("09:00")])?.id).toBe("auto");
  });

  it("is something the backend has when it says each conversation's kind", () => {
    expect(serverHasAutomationsChat([conversation("a", "10:00", { kind: "chat" }), pinned("09:00")])).toBe(true);
    expect(serverHasAutomationsChat([])).toBe(true);
    expect(serverHasAutomationsChat([conversation("a", "10:00", { kind: "chat" }), conversation("b", "09:00")])).toBe(false);
  });

  it("is never the active web conversation, and never one of the dated list's rows", () => {
    const a = conversation("a", "10:00", { active: true });
    // Even if something said it was active, the web chat writes in the real active one.
    expect(activeWebConversation([pinned("11:00", { active: true }), a])?.id).toBe("a");
    const list = placeConversation(listOf([[a]]), pinned("11:00"));
    expect(allConversations(list).map((item) => item.id)).toEqual(["a"]);
    // One that got into the list is taken out of it.
    expect(allConversations(placeConversation(listOf([[pinned("09:00"), a]]), pinned("11:00"))).map((item) => item.id)).toEqual(["a"]);
  });

  it("moves on with each message saved in it, and stays not active when the person writes there", () => {
    const chat = pinned("09:00");
    const run = automationsChatSpoke(chat, { conversationId: "auto", createdAt: at("09:30"), direction: "out" });
    expect(run).toMatchObject({ lastMessageAt: at("09:30"), active: false });
    expect(automationsChatSpoke(run, { conversationId: "auto", createdAt: at("09:10"), direction: "out" })).toBe(run);
    expect(automationsChatSpoke(run, { conversationId: "other", createdAt: at("10:00"), direction: "out" })).toBe(run);
  });

  it("is unread after a run's answer, and read after the person writes there, when the backend says unread", () => {
    const chat = pinned("09:00", { unread: false });
    const run = automationsChatSpoke(chat, { conversationId: "auto", createdAt: at("09:30"), direction: "out" });
    expect(run.unread).toBe(true);
    expect(automationsChatSpoke(run, { conversationId: "auto", createdAt: at("09:40"), direction: "in" }).unread).toBe(false);
    // An older backend says nothing about it, and nothing is made up.
    expect(automationsChatSpoke(pinned("09:00"), { conversationId: "auto", createdAt: at("09:30"), direction: "out" }).unread).toBeUndefined();
  });

  it("takes the backend's word for its mark when it gives one, on any device, and never while it is open", () => {
    const chat = pinned("09:30");
    const remembered = { id: "auto", at: at("09:30") };
    expect(automationsUnread({ ...chat, unread: true }, remembered, false)).toBe(true);
    expect(automationsUnread({ ...chat, unread: true }, null, false)).toBe(true);
    expect(automationsUnread({ ...chat, unread: true }, remembered, true)).toBe(false);
    expect(automationsUnread({ ...chat, unread: false }, { id: "auto", at: at("09:00") }, false)).toBe(false);
  });

  it("lights its mark when a run arrived after it was last seen, and not while it is open", () => {
    const chat = pinned("09:00");
    // The first time this browser meets it: what is in it counts as seen.
    const first = seenToRemember(chat, null);
    expect(first).toEqual({ id: "auto", at: at("09:00") });
    expect(automationsUnread(chat, first, false)).toBe(false);
    expect(seenToRemember(chat, first)).toBeNull();

    const later = { ...chat, lastMessageAt: at("09:30") };
    expect(automationsUnread(later, first, false)).toBe(true);
    expect(automationsUnread(later, first, true)).toBe(false);
    expect(automationsUnread(later, { id: "auto", at: at("09:30") }, false)).toBe(false);
    expect(automationsUnread(null, first, false)).toBe(false);

    // Deleted and started again by a run: a new chat, and its runs were not seen yet.
    const again = pinned("12:00", { id: "auto2", startedAt: at("11:59") });
    const remembered = seenToRemember(again, first);
    expect(remembered).toEqual({ id: "auto2", at: at("11:59") });
    expect(automationsUnread(again, remembered, false)).toBe(true);
  });
});

describe("unread conversations", () => {
  it("are marked unless they are the one open, and not at all by an older backend", () => {
    const unread = conversation("a", "10:00", { unread: true });
    const read = conversation("b", "09:00", { unread: false });
    const older = conversation("c", "08:30");
    expect(showsUnread(unread, null)).toBe(true);
    expect(showsUnread(unread, "a")).toBe(false);
    expect(showsUnread(read, null)).toBe(false);
    expect(showsUnread(older, null)).toBe(false);
    expect(anyUnread([read, older, unread], null)).toBe(true);
    expect(anyUnread([read, older, unread], "a")).toBe(false);
    expect(anyUnread([], null)).toBe(false);
  });

  it("become unread with a reply from Tex, and read when the person writes, as the backend counts it", () => {
    const read = conversation("a", "09:00", { unread: false });
    expect(unreadAfter(read, { direction: "out" })).toEqual({ ...read, unread: true });
    expect(unreadAfter({ ...read, unread: true }, { direction: "in" }).unread).toBe(false);
    // Nothing changes: the same object back.
    expect(unreadAfter(read, { direction: "in" })).toBe(read);
    const older = conversation("b", "09:00");
    expect(unreadAfter(older, { direction: "out" })).toBe(older);
  });

  it("a reply to a conversation that isn't open puts the mark on it as it moves to the top", () => {
    const list = listOf([[conversation("open", "10:00", { active: true, unread: false }), conversation("other", "09:00", { unread: false })]]);
    const next = conversationSpoke(list, { conversationId: "other", channel: "telegram", direction: "out", createdAt: at("10:30") })!;
    const [first, second] = allConversations(next);
    expect(first).toMatchObject({ id: "other", unread: true, lastMessageAt: at("10:30") });
    expect(second).toMatchObject({ id: "open", unread: false });
    expect(showsUnread(first, "open")).toBe(true);
    // The person's own message in it: what came before counts as seen.
    const after = conversationSpoke(next, { conversationId: "other", channel: "telegram", direction: "in", createdAt: at("10:40") })!;
    expect(allConversations(after)[0]).toMatchObject({ id: "other", unread: false });
  });

  it("are read at once when marked, and take the backend's answer unless something newer arrived", () => {
    const unread = conversation("a", "10:00", { unread: true });
    expect(readMarked(unread)).toEqual({ ...unread, unread: false });
    expect(readMarked(unread, { ...unread, unread: false })).toEqual({ ...unread, unread: false });
    // A reply arrived after the answer was made: its own event decides, the answer doesn't undo it.
    const newer = conversation("a", "10:05", { unread: true });
    expect(readMarked(newer, { ...unread, unread: false })).toBe(newer);
    // Read already, or an older backend: nothing changes.
    const read = conversation("a", "10:00", { unread: false });
    expect(readMarked(read)).toBe(read);
    const older = conversation("a", "10:00");
    expect(readMarked(older)).toBe(older);
  });

  it("change one conversation in its place, and leave the list as it is when nothing changed", () => {
    const list = listOf([[conversation("a", "10:00", { unread: true })], [conversation("b", "09:00", { unread: true })]]);
    const next = changeConversation(list, "b", (item) => readMarked(item));
    expect(allConversations(next).map((item) => [item.id, item.unread])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    expect(next.pages[0]).toBe(list.pages[0]);
    expect(changeConversation(next, "b", (item) => readMarked(item))).toBe(next);
    expect(changeConversation(list, "missing", (item) => readMarked(item))).toBe(list);
  });
});
