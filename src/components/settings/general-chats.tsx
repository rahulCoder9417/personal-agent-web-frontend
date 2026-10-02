"use client";

import { AppIcon } from "@/components/brand-icon";
import { ButtonLink, Card, ErrorState, InlineError, Meta, Pill, SectionLabel, SkeletonRows } from "@/components/ui";
import type { ChannelLink, ChannelType } from "@/lib/api/client";
import { useChannels, useUnlinkChannel } from "@/lib/api/hooks";
import { CHANNEL_LABEL, formatDate } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";

/** The chat apps a person can link, in the order they're offered. */
const LINKABLE: ChannelType[] = ["whatsapp", "telegram", "imessage"];

function LinkedRow({ link }: { link: ChannelLink }) {
  const unlink = useUnlinkChannel();
  const label = CHANNEL_LABEL[link.channel];
  return (
    <li className="flex flex-col gap-1 border-b border-line px-5 py-3.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <AppIcon name={link.channel} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold">{label}</span>
            {link.within24hWindow && (
              <span title="Inside WhatsApp's 24-hour window, so Tex can reply freely">
                <Pill tone="done">Replies open</Pill>
              </span>
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
          onConfirm={() => unlink.mutate(link.id)}
        />
      </div>
      <InlineError error={unlink.error} className="pl-12" />
    </li>
  );
}

function UnlinkedRow({ channel }: { channel: ChannelType }) {
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

export function LinkedChatsSection() {
  const channels = useChannels();

  return (
    <section aria-label="Linked chats" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SectionLabel>Linked chats</SectionLabel>
        <p className="text-[12.5px] text-muted">Any of these chats is Tex. Messages from all of them land in one thread.</p>
      </div>

      {channels.isPending ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : channels.isError ? (
        <ErrorState error={channels.error} onRetry={() => void channels.refetch()} />
      ) : (
        <Card>
          <ul>
            {channels.data
              .filter((link) => link.channel !== "web")
              .map((link) => (
                <LinkedRow key={link.id} link={link} />
              ))}
            {LINKABLE.filter((channel) => !channels.data.some((link) => link.channel === channel)).map((channel) => (
              <UnlinkedRow key={channel} channel={channel} />
            ))}
          </ul>
        </Card>
      )}

      <Meta className="text-[12px]">
        Linking uses a one-time code that expires in 10 minutes. Unknown numbers only get a “link your account” reply.
      </Meta>
    </section>
  );
}
