// What the chat thread shows apart from the messages themselves: whether Tex is at work in it,
// where the "New chat" divider goes, and whether starting a new chat needs a second click.

import { ApiError, errorMessage, type ChannelType, type Message } from "./api/client";

type Filter = ChannelType | "all";
type Dated = Pick<Message, "createdAt">;

const time = (iso: string) => Date.parse(iso);

/**
 * Whether the "Tex is working" bubble belongs in this thread. The agent's status and progress
 * carry no channel, so with every chat app shown ("all") it is the agent's state. With one chat
 * app picked, the thread must have a turn of its own going: the backend moves the incoming message
 * a turn answers to `processing` when the agent takes it, and on to `delivered` or `failed` when
 * the turn ends (`message.status` on the stream). Messages still `queued` wait behind it and are
 * skipped, so it is the newest incoming message that has left the queue. `busy` must hold too, so
 * a message left `processing` by a turn that never finished doesn't keep the bubble up.
 *
 * `messages` is the thread as the API lists it, newest first.
 */
export function threadIsWorking(filter: Filter, busy: boolean, messages: readonly Pick<Message, "channel" | "direction" | "status">[]): boolean {
  if (!busy) return false;
  if (filter === "all") return true;
  const taken = messages.find((message) => message.direction === "in" && message.channel === filter && message.status !== "queued");
  return taken?.status === "processing";
}

// ---------------------------------------------------------------- new chat

/** Only the web chat's new chat is known (`chatStartedAt`), so a thread without the web chat has no divider. */
export function showsNewChat(filter: Filter): boolean {
  return filter === "all" || filter === "web";
}

/**
 * Where the "New chat" divider goes in a thread read oldest first: before the first message after
 * `chatStartedAt`, or at the end (the length of the list) when nothing has been said since. Null
 * when there is no divider: no new chat yet, an empty thread, or a start older than every message
 * loaded while older ones are still to load (it shows once they are).
 */
export function newChatDividerAt(messagesOldestFirst: readonly Dated[], chatStartedAt: string | null | undefined, complete: boolean): number | null {
  if (!chatStartedAt || messagesOldestFirst.length === 0) return null;
  const start = time(chatStartedAt);
  const index = messagesOldestFirst.findIndex((message) => time(message.createdAt) > start);
  const at = index === -1 ? messagesOldestFirst.length : index;
  if (at === 0 && !complete) return null;
  return at;
}

/**
 * Whether the web chat has nothing in it since it last started, so a new chat loses nothing and
 * needs no second click. Only web messages count: a new chat started here is the web chat's.
 * When the messages loaded don't reach back to the start it isn't known, and the answer is no.
 */
export function webChatIsEmpty(
  messages: readonly Pick<Message, "channel" | "createdAt">[],
  chatStartedAt: string | null | undefined,
  complete: boolean,
): boolean {
  const start = chatStartedAt ? time(chatStartedAt) : -Infinity;
  if (messages.some((message) => message.channel === "web" && time(message.createdAt) > start)) return false;
  if (complete) return true;
  return messages.some((message) => time(message.createdAt) <= start);
}

/** Said under the divider: what a new chat means. */
export const NEW_CHAT_NOTE = "Tex won’t use what was said above. Your saved memories stay.";

/** A new chat that couldn't be started, in words. */
export function newChatError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return "That’s a lot of new chats in an hour. Try again in a little while.";
  return errorMessage(error);
}
