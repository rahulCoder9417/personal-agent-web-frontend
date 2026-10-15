// Which chat apps are on offer. The backend decides (`available` in GET /v1/channels);
// nothing here names a chat app that it could offer by itself.

import type { ChannelLink, ChannelType } from "./api/client";
import { formatAgo } from "./format";

/** A chat app that gets linked with a one-time code. The web chat is this app, so it isn't one. */
export type LinkableChannel = Exclude<ChannelType, "web">;

/** The chat apps a person can link right now, in the backend's order. */
export function linkableChannels(available: readonly ChannelType[]): LinkableChannel[] {
  return available.filter((channel): channel is LinkableChannel => channel !== "web");
}

/**
 * The channels the chat can be filtered by: the ones that are switched on, then any that are off
 * but still have a linked chat or messages in the history, so old conversations stay reachable.
 */
export function channelsToShow(available: readonly ChannelType[], seen: Iterable<ChannelType>): ChannelType[] {
  const shown = [...available];
  for (const channel of seen) {
    if (!shown.includes(channel)) shown.push(channel);
  }
  return shown;
}

// What a linked chat says about itself. `maskedChatId`, `lastInboundAt` and `blocked` came to
// GET /v1/channels on 15 October 2026; a backend from before sends none of them, and the row then
// looks as it did.

/**
 * The chat's id, masked ("•••• 4821"), when it says more than the name the chat is shown as. A
 * WhatsApp or iMessage chat is shown as its masked number already, so it isn't repeated.
 */
export function maskedChatIdToShow(link: Pick<ChannelLink, "displayId" | "maskedChatId">): string | null {
  const masked = link.maskedChatId?.trim();
  return masked && masked !== link.displayId ? masked : null;
}

/**
 * "Last message 2h ago", "Last message yesterday", "Last message 12 Sep": when the chat last wrote
 * to Tex (linking counts). Null when the backend doesn't say.
 */
export function lastMessageLine(link: Pick<ChannelLink, "lastInboundAt">, now = new Date()): string | null {
  if (!link.lastInboundAt) return null;
  const ago = formatAgo(link.lastInboundAt, now);
  return `Last message ${ago === "Yesterday" ? "yesterday" : ago}`;
}

/** The person blocked the bot in this chat, so Tex can't send anything there. False when the backend doesn't say. */
export function blockedTheBot(link: Pick<ChannelLink, "blocked">): boolean {
  return link.blocked === true;
}
