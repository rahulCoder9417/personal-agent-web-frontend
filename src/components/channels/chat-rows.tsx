"use client";

import { useState, type ReactNode } from "react";
import { AppIcon } from "@/components/brand-icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast, toastError } from "@/components/toast";
import { Button, Meta, Pill } from "@/components/ui";
import type { ChannelLink } from "@/lib/api/client";
import { useUnlinkChannel } from "@/lib/api/hooks";
import { blockedTheBot, lastMessageLine, maskedChatIdToShow, type LinkableChannel } from "@/lib/channels";
import { CHANNEL_LABEL, formatDate } from "@/lib/format";

// The rows of a list of chat apps: a chat that is linked (with Unlink, which asks first in a
// `ConfirmDialog`, as Disconnect does for an app), a chat app that isn't yet (with the caller's way to link it). Integrations and
// Settings → General both list them.

const ROW = "flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 max-sm:px-4";

/**
 * "Unlink Telegram (@aarav_s)?": what stops, and Unlink or Cancel. Unlinking is the person's own
 * `DELETE /v1/channels/{id}`; a toast says how it went, and once the list is asked for again the
 * chat app is offered for linking again.
 */
function UnlinkDialog({ link, unlink, onClose }: { link: ChannelLink; unlink: ReturnType<typeof useUnlinkChannel>; onClose: () => void }) {
  const label = CHANNEL_LABEL[link.channel];
  return (
    <ConfirmDialog
      title={`Unlink ${label} (${link.displayId})?`}
      icon={<AppIcon name={link.channel} size={44} />}
      confirmLabel={`Unlink ${label}`}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await unlink.mutateAsync(link.id);
          toast({ title: `${label} unlinked`, body: `Messages from ${link.displayId} no longer reach Tex. Link it again any time with a new code.` });
        } catch (error) {
          toastError(`Couldn’t unlink ${label}`, error);
        }
      }}
    >
      <p>
        Tex stops reading and answering this chat, and anything sent there only gets the “link your account” reply. Your chat history stays.
      </p>
    </ConfirmDialog>
  );
}

/**
 * A linked chat: the chat app, the name it is shown as and its masked chat id, when it was linked,
 * when it last wrote, and Unlink, which asks first. `off`: the chat app has been switched off since
 * this chat was linked. It can still be unlinked. "Blocked the bot": the person blocked the bot
 * there, so Tex can't send anything to it until they unblock it and write again. A backend that
 * doesn't send the masked id, the last message or `blocked` gets the row without them.
 */
export function LinkedChatRow({ link, off, now }: { link: ChannelLink; off: boolean; now?: Date }) {
  const [asking, setAsking] = useState(false);
  // Here rather than in the dialog, so the row's button shows the work too.
  const unlink = useUnlinkChannel();
  const label = CHANNEL_LABEL[link.channel];
  const chatId = maskedChatIdToShow(link);
  const lastMessage = lastMessageLine(link, now);
  const blocked = blockedTheBot(link);
  return (
    <li className={ROW}>
      <AppIcon name={link.channel} size={36} className={off ? "opacity-70" : undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold">{label}</span>
          {off && (
            <span title={`${label} is switched off for now, so messages from it don’t reach Tex`}>
              <Pill>Switched off</Pill>
            </span>
          )}
          {blocked && (
            <span title={`The bot is blocked in ${label}, so Tex can’t send anything to this chat`}>
              <Pill tone="danger">Blocked the bot</Pill>
            </span>
          )}
          {off || blocked ? null : link.within24hWindow ? (
            <span title="Inside WhatsApp's 24-hour window, so Tex can reply freely">
              <Pill tone="done">Replies open</Pill>
            </span>
          ) : (
            <Pill tone="done">Linked</Pill>
          )}
        </div>
        <span className="truncate text-[13px] text-fg-2">
          {link.displayId}
          {chatId && (
            <span className="text-muted" title="The chat’s id, masked">
              {" · "}
              {chatId}
            </span>
          )}
        </span>
        <Meta className="truncate text-[12px]">
          Linked {formatDate(link.linkedAt, now)}
          {lastMessage && ` · ${lastMessage}`}
        </Meta>
        {blocked && (
          <Meta className="text-[12px]">
            Tex can’t send anything here. Unblock the bot in {label} and send it a message to start again.
          </Meta>
        )}
      </div>
      <Button size="sm" variant="danger-outline" pending={unlink.isPending} onClick={() => setAsking(true)} aria-label={`Unlink ${label} ${link.displayId}`}>
        Unlink
      </Button>
      {asking && <UnlinkDialog link={link} unlink={unlink} onClose={() => setAsking(false)} />}
    </li>
  );
}

/** A chat app that can be linked and isn't yet. `action` is the way to link it, a button or a link. */
export function UnlinkedChatRow({ channel, note = "Not linked yet", action }: { channel: LinkableChannel; note?: string; action: ReactNode }) {
  return (
    <li className={ROW}>
      <AppIcon name={channel} size={36} className="opacity-70" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold">{CHANNEL_LABEL[channel]}</span>
        <Meta>{note}</Meta>
      </div>
      {action}
    </li>
  );
}

/** The web chat: this app. It is always there while it is switched on, so there is nothing to link. */
export function WebChatRow() {
  return (
    <li className={ROW}>
      <AppIcon name="web" size={36} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold">Web chat</span>
          <Pill tone="done">Always on</Pill>
        </div>
        <Meta className="text-[12px]">Right here in this app, on any computer or phone you sign in on</Meta>
      </div>
    </li>
  );
}
