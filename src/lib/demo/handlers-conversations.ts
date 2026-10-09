// Conversations for the demo account: the chat history. A conversation is one stretch of a chat
// between two "New chat" actions, and Tex's context is separate for each.

import type { ChannelType, Conversation, Message } from "@/lib/api/client";
import { CHANNEL_LABEL } from "@/lib/format";
import { conversationTitle, NEW_CHAT_TITLE, type Handler } from "./context";
import { badRequest, conflict, json, noContent, notFound, oneOf, paginate, rateLimited, readJson, stringField } from "./http";
import { emit, logActivity, nextId, type DemoState } from "./store";

const CHANNELS: readonly ChannelType[] = ["whatsapp", "telegram", "imessage", "web"];
const NEW_CHATS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;

const newestFirst = (a: Conversation, b: Conversation) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);

export function findConversation(state: DemoState, id: string | undefined): Conversation | undefined {
  return state.conversations.find((conversation) => conversation.id === id);
}

/** The web conversation that web messages are saved in. */
export function activeWebConversation(state: DemoState): Conversation | undefined {
  return state.conversations.find((conversation) => conversation.channel === "web" && conversation.active);
}

/** The conversation a chat app writes in: its chat's latest one. */
export function activeConversation(state: DemoState, channel: ChannelType): Conversation | undefined {
  return state.conversations.find((conversation) => conversation.channel === channel && conversation.active);
}

/** Makes one web conversation the active one. Each conversation that changed is sent on the stream. */
export function makeActive(state: DemoState, conversation: Conversation): void {
  for (const other of state.conversations) {
    if (other.channel !== conversation.channel || other === conversation || !other.active) continue;
    other.active = false;
    emit(state, "conversation.updated", other);
  }
  if (conversation.active) return;
  conversation.active = true;
  emit(state, "conversation.updated", conversation);
}

/**
 * A new, empty web conversation, made the active one: the chat's epoch goes up by one. Tex starts
 * afresh in it; its memories stay. No turn runs and nothing is charged.
 */
export function startWebConversation(state: DemoState): Conversation {
  const epochs = state.conversations.filter((conversation) => conversation.channel === "web").map((conversation) => conversation.epoch);
  const at = new Date().toISOString();
  const conversation: Conversation = {
    id: nextId(state, "cnv"),
    channel: "web",
    epoch: epochs.length ? Math.max(...epochs) + 1 : 0,
    startedAt: at,
    lastMessageAt: at,
    title: NEW_CHAT_TITLE,
    active: false,
  };
  state.conversations.push(conversation);
  makeActive(state, conversation);
  return conversation;
}

/**
 * A message was saved in a conversation: it moves to the top of the list, and the first incoming
 * message names it (unless the person already renamed it).
 */
export function messageSaved(state: DemoState, message: Message): void {
  const conversation = findConversation(state, message.conversationId);
  if (!conversation) return;
  const first = !state.messages.some((other) => other.id !== message.id && other.conversationId === conversation.id && other.direction === "in");
  if (message.direction === "in" && first && conversation.title === NEW_CHAT_TITLE) conversation.title = conversationTitle(message.text);
  conversation.lastMessageAt = message.createdAt;
  emit(state, "conversation.updated", conversation);
}

// ---------------------------------------------------------------- endpoints

export const listConversations: Handler = ({ state, url }) => {
  const raw = url.searchParams.get("channel");
  const channel = raw === null ? null : oneOf(raw, CHANNELS, "channel");
  const items = state.conversations.filter((conversation) => !channel || conversation.channel === channel).sort(newestFirst);
  return json(paginate(items, url));
};

/** New chats share one limit of 30 an hour, whichever path asked. */
function takeNewChat(state: DemoState): Conversation {
  const now = Date.now();
  state.newChatCalls = state.newChatCalls.filter((at) => now - at < HOUR_MS);
  if (state.newChatCalls.length >= NEW_CHATS_PER_HOUR) throw rateLimited();
  state.newChatCalls.push(now);

  const conversation = startWebConversation(state);
  // The channel, never what was said.
  logActivity(state, { actor: "user", action: "chat_started", summary: "Started a new chat in web chat" });
  return conversation;
}

export const createConversation: Handler = ({ state }) => json(takeNewChat(state), 201);

/** `POST /v1/chats/new`, the earlier name of the same thing, with the answer it always gave. */
export const startNewChat: Handler = ({ state }) => json({ chatStartedAt: takeNewChat(state).startedAt });

export const updateConversation: Handler = async ({ state, request, params }) => {
  const body = await readJson(request);
  const conversation = findConversation(state, params.conversationId);
  if (!conversation) throw notFound("That conversation doesn't exist");

  const title = stringField(body, "title")?.trim();
  if (title !== undefined && (title.length < 1 || title.length > 80)) throw badRequest("title must be between 1 and 80 characters");
  if (body.active !== undefined && body.active !== true) throw badRequest("active can only be set to true");
  if (title === undefined && body.active === undefined) throw badRequest("Nothing to change");
  if (body.active === true && conversation.channel !== "web") {
    throw conflict(`A ${CHANNEL_LABEL[conversation.channel]} conversation can't be made active from the web`);
  }

  const renamed = title !== undefined && title !== conversation.title;
  if (renamed) conversation.title = title;
  const becomesActive = body.active === true && !conversation.active;
  // Making it active sends it on the stream, new title included; a rename alone is sent here.
  if (becomesActive) makeActive(state, conversation);
  else if (renamed) emit(state, "conversation.updated", conversation);
  return json(conversation);
};

export const deleteConversation: Handler = ({ state, params }) => {
  const conversation = findConversation(state, params.conversationId);
  if (!conversation) throw notFound("That conversation doesn't exist");

  // Its messages and their files go with it: they are the person's own data.
  const gone = state.messages.filter((message) => message.conversationId === conversation.id);
  const goneIds = new Set(gone.map((message) => message.id));
  for (const message of gone) {
    for (const file of message.attachments ?? []) if (file.id) delete state.attachments[file.id];
  }
  for (const [clientMessageId, messageId] of Object.entries(state.sentIds)) {
    if (goneIds.has(messageId)) delete state.sentIds[clientMessageId];
  }
  state.messages = state.messages.filter((message) => !goneIds.has(message.id));
  state.conversations = state.conversations.filter((other) => other !== conversation);
  emit(state, "conversation.deleted", conversation);
  // No title and no text: only that it happened, and where.
  logActivity(state, { actor: "user", action: "conversation_deleted", summary: `Deleted a chat in ${conversation.channel === "web" ? "web chat" : CHANNEL_LABEL[conversation.channel]}` });

  // Web chat always has a conversation to write in: the newest one left, or a new empty one.
  if (conversation.channel === "web" && conversation.active) {
    const next = state.conversations.filter((other) => other.channel === "web").sort(newestFirst)[0];
    if (next) makeActive(state, next);
    else startWebConversation(state);
  }
  return noContent();
};
