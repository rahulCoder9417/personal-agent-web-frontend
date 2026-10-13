// The chat history: which conversation the chat opens on, what can be done with one, and how the
// cached list is kept in order as things happen. No React here, so it can be unit tested.

import { ApiError, errorMessage, type ChannelType, type Conversation, type Message } from "./api/client";
import { CHANNEL_LABEL } from "./format";

export type ConversationPage = { items: Conversation[]; nextCursor: string | null };
/** The list as the query cache keeps it: the pages asked for so far, newest first. */
export type ConversationList = { pages: ConversationPage[]; pageParams: unknown[] };

/** What the backend calls a conversation nobody has said anything in yet. */
export const NEW_CHAT_TITLE = "New chat";
/** The Automations chat's name: the backend gives it, and it can't be changed. */
export const AUTOMATIONS_TITLE = "Automations";
/** The chat's address with the Automations chat open (the backend's Telegram copies link here too). */
export const AUTOMATIONS_CHAT_HREF = "/?chat=automations";

/**
 * The Automations chat: where every run of every automation answers (timers, app events,
 * pull-request review verdicts, and the notices about them). One per person, a web conversation
 * that is never the active one. It is pinned above the dated list rather than mixed into it.
 */
export function isAutomationsChat(conversation: Pick<Conversation, "kind"> | null | undefined): boolean {
  return conversation?.kind === "automations";
}
/** The longest name a conversation can be given (`PATCH /v1/conversations/{id}`). */
export const TITLE_MAX = 80;

/** When something was last said in a conversation; one with nothing in it has only its start. */
export function lastSpokenAt(conversation: Pick<Conversation, "lastMessageAt" | "startedAt">): string {
  return conversation.lastMessageAt ?? conversation.startedAt;
}

const time = (conversation: Pick<Conversation, "lastMessageAt" | "startedAt">) => Date.parse(lastSpokenAt(conversation));

/** A conversation's name as the list and the header show it. */
export function titleOf(conversation: Pick<Conversation, "title">): string {
  return conversation.title.trim() || NEW_CHAT_TITLE;
}

/**
 * A name as typed, ready to save: trimmed, runs of spaces made one. Null when there is nothing to
 * save: it is empty, too long, or what the conversation is already called.
 */
export function titleToSave(typed: string, current: string): string | null {
  const title = typed.replace(/\s+/g, " ").trim();
  if (title.length < 1 || title.length > TITLE_MAX || title === current) return null;
  return title;
}

/** Every conversation loaded so far, newest first. One that two pages both carry is listed once. */
export function allConversations(list: ConversationList | undefined): Conversation[] {
  const seen = new Set<string>();
  const all: Conversation[] = [];
  for (const page of list?.pages ?? []) {
    for (const conversation of page.items) {
      if (seen.has(conversation.id)) continue;
      seen.add(conversation.id);
      all.push(conversation);
    }
  }
  return all;
}

/** The web conversation that web messages are saved in. Never the Automations chat. */
export function activeWebConversation(conversations: readonly Conversation[]): Conversation | undefined {
  return conversations.find((conversation) => conversation.channel === "web" && conversation.active && !isAutomationsChat(conversation));
}

/**
 * The conversation the chat shows. The one the person picked, while it exists; otherwise the
 * active web conversation, which is where they write. With web chat switched off there is nothing
 * to write in, so it is the newest conversation, to read. Null when there is none yet.
 */
export function conversationToOpen(conversations: readonly Conversation[], pickedId: string | null, webChatOn: boolean): Conversation | null {
  const picked = pickedId ? conversations.find((conversation) => conversation.id === pickedId) : undefined;
  if (picked) return picked;
  if (webChatOn) return activeWebConversation(conversations) ?? null;
  return conversations[0] ?? null;
}

/** Only a web conversation can be written in from here. Another chat app's is read here and answered there. */
export function canWriteIn(conversation: Pick<Conversation, "channel"> | null): boolean {
  return conversation === null || conversation.channel === "web";
}

/** Said in place of the composer under a conversation of another chat app. */
export function readOnlyNote(channel: ChannelType): string {
  return `Reply on ${CHANNEL_LABEL[channel]} to continue this chat`;
}

/**
 * The active web conversation, when nothing has been said in it: "New chat" opens it instead of
 * starting another empty one. `isEmpty` says whether a conversation's thread is known to be empty
 * (undefined when its messages haven't been asked for).
 */
export function emptyActiveChat(conversations: readonly Conversation[], isEmpty: (conversationId: string) => boolean | undefined): Conversation | null {
  const active = activeWebConversation(conversations);
  return active && isEmpty(active.id) === true ? active : null;
}

/** A new chat that couldn't be started, in words. */
export function newChatError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return "That’s a lot of new chats in an hour. Try again in a little while.";
  return errorMessage(error);
}

// ---------------------------------------------------------------- the cached list

const withoutIt = (list: ConversationList, id: string): ConversationList => ({
  ...list,
  pages: list.pages.map((page) => (page.items.some((item) => item.id === id) ? { ...page, items: page.items.filter((item) => item.id !== id) } : page)),
});

/**
 * The list without one conversation (it was deleted). When that was the active web conversation,
 * the newest web conversation left becomes the active one, as the backend makes it. (When none is
 * left the backend starts an empty one, which only it can say.)
 */
export function dropConversation(list: ConversationList, id: string): ConversationList {
  const dropped = list.pages.flatMap((page) => page.items).find((item) => item.id === id);
  if (!dropped) return list;
  const rest = withoutIt(list, id);
  if (dropped.channel !== "web" || !dropped.active) return rest;
  const next = rest.pages.flatMap((page) => page.items).find((item) => item.channel === "web");
  if (!next) return rest;
  return { ...rest, pages: rest.pages.map((page) => ({ ...page, items: page.items.map((item) => (item === next ? { ...item, active: true } : item)) })) };
}

/**
 * The conversation a first web message started, before the backend has said what it is: the
 * message's own conversation, active, with nothing known about it but that message. It lets the
 * chat show what was just sent; the backend's copy replaces it as soon as it arrives.
 */
export function conversationStartedBy(message: Pick<Message, "conversationId" | "channel" | "createdAt">): Conversation {
  return {
    id: message.conversationId,
    channel: message.channel,
    kind: "chat",
    epoch: 0,
    startedAt: message.createdAt,
    lastMessageAt: message.createdAt,
    title: NEW_CHAT_TITLE,
    active: true,
  };
}

/**
 * Puts a new or changed conversation where it belongs in the list, which is ordered by when
 * something was last said, newest first.
 *
 * - One whose time didn't change (a rename, `active`) keeps its place.
 * - One that is older than everything loaded while more pages are still to come is left out: the
 *   page it belongs to will bring it. One that was already listed is never lost that way.
 * - Only one web conversation is the active one, so when this one is, the others stop being it
 *   (their own events may come later, or were missed).
 */
export function placeConversation(list: ConversationList, conversation: Conversation): ConversationList {
  if (list.pages.length === 0) return list;
  // The Automations chat is pinned apart, never one of the dated list's rows.
  if (isAutomationsChat(conversation)) return list.pages.some((page) => page.items.some((item) => item.id === conversation.id)) ? withoutIt(list, conversation.id) : list;
  const loaded = list.pages.flatMap((page) => page.items);
  const before = loaded.find((item) => item.id === conversation.id);

  let pages = list.pages;
  if (conversation.channel === "web" && conversation.active && loaded.some((item) => item.channel === "web" && item.active && item.id !== conversation.id)) {
    pages = pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.channel === "web" && item.active && item.id !== conversation.id ? { ...item, active: false } : item)),
    }));
  }

  if (before && time(before) === time(conversation)) {
    return { ...list, pages: pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === conversation.id ? conversation : item)) })) };
  }

  pages = withoutIt({ ...list, pages }, conversation.id).pages;
  const at = time(conversation);
  for (let index = 0; index < pages.length; index++) {
    const position = pages[index].items.findIndex((item) => time(item) <= at);
    if (position === -1) continue;
    const items = pages[index].items.slice();
    items.splice(position, 0, conversation);
    return { ...list, pages: pages.map((page, i) => (i === index ? { ...page, items } : page)) };
  }
  // Older than everything loaded.
  const last = pages.length - 1;
  if (!before && pages[last].nextCursor !== null) return { ...list, pages };
  return { ...list, pages: pages.map((page, i) => (i === last ? { ...page, items: [...page.items, conversation] } : page)) };
}

/**
 * A message was saved in a conversation: it now has the newest message, so it moves to the top,
 * and an incoming web message makes its conversation the active one (writing in an earlier
 * conversation does that). The backend says the same with `conversation.updated`; this keeps the
 * list right until that arrives. Null when the conversation isn't in the list, so it has to be
 * asked for. A message that isn't newer than what the list knows changes nothing.
 */
export function conversationSpoke(
  list: ConversationList,
  message: Pick<Message, "conversationId" | "channel" | "direction" | "createdAt">,
): ConversationList | null {
  const conversation = list.pages.flatMap((page) => page.items).find((item) => item.id === message.conversationId);
  if (!conversation) return null;
  if (Date.parse(message.createdAt) <= time(conversation)) return list;
  const writtenIn = message.channel === "web" && message.direction === "in";
  return placeConversation(list, { ...conversation, lastMessageAt: message.createdAt, active: conversation.active || writtenIn });
}

// ---------------------------------------------------------------- the Automations chat

/**
 * The Automations chat after a message was saved in it: its newest message is now later. It
 * stays where it is (pinned) and never becomes the active one, even when the person writes in it.
 * Unchanged when the message isn't newer, or isn't its.
 */
export function automationsChatSpoke(chat: Conversation, message: Pick<Message, "conversationId" | "createdAt">): Conversation {
  if (message.conversationId !== chat.id || Date.parse(message.createdAt) <= time(chat)) return chat;
  return { ...chat, lastMessageAt: message.createdAt };
}

/** What this browser remembers of the Automations chat: which one, and up to when its runs were seen. */
export type AutomationsSeen = { id: string; at: string };

/**
 * What is remembered once the Automations chat is known. Nothing remembered yet (the first time
 * this browser sees one): everything in it counts as seen, so the mark isn't lit for runs from
 * before. A different chat than the one remembered (the old one was deleted, and a run started
 * this one): nothing in it was seen yet. Null: keep what is remembered.
 */
export function seenToRemember(chat: Conversation, seen: AutomationsSeen | null): AutomationsSeen | null {
  if (seen === null) return { id: chat.id, at: lastSpokenAt(chat) };
  if (seen.id !== chat.id) return { id: chat.id, at: chat.startedAt };
  return null;
}

/**
 * Whether the Automations chat shows its unread mark: something arrived in it after it was last
 * seen, and it isn't the one open (while it is open, what arrives is being seen).
 */
export function automationsUnread(chat: Conversation | null, seen: AutomationsSeen | null, open: boolean): boolean {
  if (!chat || open || seen === null || seen.id !== chat.id) return false;
  return time(chat) > Date.parse(seen.at);
}
