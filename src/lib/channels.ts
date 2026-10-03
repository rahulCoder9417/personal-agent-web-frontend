// Which chat apps are on offer. The backend decides (`available` in GET /v1/channels);
// nothing here names a chat app that it could offer by itself.

import type { ChannelType } from "./api/client";

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
