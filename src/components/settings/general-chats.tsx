"use client";

import { AppIcon } from "@/components/brand-icon";
import { toastError } from "@/components/toast";
import { ButtonLink, Card, ErrorState, Meta, Pill, SectionLabel, SkeletonRows } from "@/components/ui";
import type { ChannelLink } from "@/lib/api/client";
import { useAvailableChannels, useChannels, useUnlinkChannel } from "@/lib/api/hooks";
import { linkableChannels, type LinkableChannel } from "@/lib/channels";
import { CHANNEL_LABEL, formatDate } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";

/** `off`: the chat app has been switched off since this chat was linked. It can still be unlinked. */
function LinkedRow({ link, off }: { link: ChannelLink; off: boolean }) {
  const unlink = useUnlinkChannel();
  const label = CHANNEL_LABEL[link.channel];
  return (
    <li className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
      <AppIcon name={link.channel} size={36} className={off ? "opacity-70" : undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold">{label}</span>
          {off ? (
            <span title={`${label} is switched off for now, so messages from it don’t reach Tex`}>
              <Pill>Switched off</Pill>
            </span>
          ) : (
            link.within24hWindow && (
              <span title="Inside WhatsApp's 24-hour window, so Tex can reply freely">
                <Pill tone="done">Replies open</Pill>
              </span>
            )
          )}
        </div>
        <Meta className="truncate">
          {link.displayId} · linked {formatDate(link.linkedAt)}
        </Meta>
      </div>
      <ConfirmButton
        label="Unlink"
        confirmLabel="Unlink chat"
        ariaLabel={`Unlink ${label} ${link.displayId}`}
        pending={unlink.isPending}
        onConfirm={() => unlink.mutate(link.id, { onError: (error) => toastError(`Couldn’t unlink ${label}`, error) })}
      />
    </li>
  );
}

function UnlinkedRow({ channel }: { channel: LinkableChannel }) {
  const label = CHANNEL_LABEL[channel];
  return (
    <li className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
      <AppIcon name={channel} size={36} className="opacity-70" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold">{label}</span>
        <Meta>not linked yet</Meta>
      </div>
      <ButtonLink href={`/onboarding?channel=${channel}`} size="sm" aria-label={`Link ${label}`}>
        Link
      </ButtonLink>
    </li>
  );
}

/** Linked chats, then the chat apps that could be linked. Which ones are offered is the backend's call. */
export function LinkedChatsSection() {
  const channels = useChannels();
  const available = useAvailableChannels();

  const links = (channels.data ?? []).filter((link) => link.channel !== "web");
  const linkable = linkableChannels(available.data ?? []);
  const unlinked = linkable.filter((channel) => !links.some((link) => link.channel === channel));

  return (
    <section aria-label="Linked chats" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SectionLabel>Linked chats</SectionLabel>
        <p className="text-[12.5px] text-muted">Any of these chats is Tex. Messages from all of them land in one thread.</p>
      </div>

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
              <LinkedRow key={link.id} link={link} off={!linkable.some((channel) => channel === link.channel)} />
            ))}
            {unlinked.map((channel) => (
              <UnlinkedRow key={channel} channel={channel} />
            ))}
          </ul>
        </Card>
      )}

      <Meta className="text-[12px]">
        Linking uses a one-time code that expires in 10 minutes. A chat we don’t know only gets a “link your account” reply.
      </Meta>
    </section>
  );
}
