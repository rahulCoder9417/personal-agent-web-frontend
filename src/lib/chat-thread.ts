// What the chat thread shows apart from the messages themselves: whether Tex is at work in it.

import type { Message } from "./api/client";

/**
 * Whether the "Tex is working" bubble belongs in a conversation's thread. The agent's status and
 * progress say nothing about which conversation the turn is for, so the thread must have a turn of
 * its own going: the backend moves the incoming message a turn answers to `processing` when the
 * agent takes it, and on to `delivered` or `failed` when the turn ends (`message.status` on the
 * stream). Messages still `queued` wait behind it and are skipped, so it is the newest incoming
 * message that has left the queue. `busy` must hold too, so a message left `processing` by a turn
 * that never finished doesn't keep the bubble up.
 *
 * `messages` is the conversation's thread as the API lists it, newest first. A turn in another
 * conversation (an earlier web chat, or one on Telegram) doesn't show here.
 */
export function threadIsWorking(busy: boolean, messages: readonly Pick<Message, "direction" | "status">[]): boolean {
  if (!busy) return false;
  const taken = messages.find((message) => message.direction === "in" && message.status !== "queued");
  return taken?.status === "processing";
}
