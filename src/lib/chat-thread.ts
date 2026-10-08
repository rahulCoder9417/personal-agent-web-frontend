// What the chat thread shows apart from the messages themselves.

import type { ChannelType, Message } from "./api/client";

type Filter = ChannelType | "all";

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
