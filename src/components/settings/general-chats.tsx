"use client";

import Link from "next/link";
import { LinkedChatRow, UnlinkedChatRow } from "@/components/channels/chat-rows";
import { ButtonLink, Card, ErrorState, Meta, SkeletonRows } from "@/components/ui";
import { useAvailableChannels, useChannels } from "@/lib/api/hooks";
import { linkableChannels } from "@/lib/channels";
import { CHANNEL_LABEL } from "@/lib/format";
import { INTEGRATIONS_PATH, linkChatHref } from "@/lib/integrations";
import { SettingsGroup } from "./settings-rows";

/**
 * Linked chats, then the chat apps that could be linked. Which ones are offered is the backend's
 * call. Linking happens in Integrations, where Link leads; a chat can be unlinked from either.
 */
export function LinkedChatsSection() {
  const channels = useChannels();
  const available = useAvailableChannels();

  const links = (channels.data ?? []).filter((link) => link.channel !== "web");
  const linkable = linkableChannels(available.data ?? []);
  const unlinked = linkable.filter((channel) => !links.some((link) => link.channel === channel));

  return (
    <SettingsGroup title="Linked chats" description="Any of these chats is Tex. Messages from all of them land in one thread.">

      {channels.isPending ? (
        <Card>
          <SkeletonRows rows={2} />
        </Card>
      ) : channels.isError ? (
        <ErrorState error={channels.error} onRetry={() => void channels.refetch()} />
      ) : links.length + unlinked.length === 0 ? (
        <Card className="px-5 py-4 text-[13.5px] text-muted">No chat app can be linked right now. You can still talk to Tex here in the web app.</Card>
      ) : (
        <Card>
          <ul>
            {links.map((link) => (
              <LinkedChatRow key={link.id} link={link} off={!linkable.some((channel) => channel === link.channel)} />
            ))}
            {unlinked.map((channel) => (
              <UnlinkedChatRow
                key={channel}
                channel={channel}
                action={
                  <ButtonLink href={linkChatHref(channel)} size="sm" aria-label={`Link ${CHANNEL_LABEL[channel]}`}>
                    Link
                  </ButtonLink>
                }
              />
            ))}
          </ul>
        </Card>
      )}

      <Meta className="text-[12px]">
        Chat apps, apps and your own MCP servers are all in{" "}
        <Link href={INTEGRATIONS_PATH} className="font-medium text-accent hover:text-accent-dark">
          Integrations
        </Link>
        . Linking uses a one-time code that expires in 10 minutes.
      </Meta>
    </SettingsGroup>
  );
}
