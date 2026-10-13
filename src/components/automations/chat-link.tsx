"use client";

import Link from "next/link";
import { useAutomationsChat } from "@/lib/api/hooks";
import { useAutomationsUnread } from "@/lib/automations-seen";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { AutomationsIcon, ChevronRightIcon } from "../icons";

/**
 * The way from the Automations screen to the Automations chat, where every run answers. It shows
 * the chat's mark when a run arrived there since it was last open.
 */
export function AutomationsChatLink() {
  const chat = useAutomationsChat().data ?? null;
  const unread = useAutomationsUnread(chat, false);
  return (
    <Link
      href={AUTOMATIONS_CHAT_HREF}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <span aria-hidden className="relative grid size-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent">
        <AutomationsIcon size={18} />
        {unread && <span data-unread className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-fg">
          See every run in the Automations chat
          {unread && <span className="sr-only"> (new runs)</span>}
        </span>
        <span className="text-[12.5px] text-muted">
          Results land there, pinned at the top of your chats, never in the chat you’re in. Write there to follow one up. One you made on Telegram
          also sends each result to Telegram.
        </span>
      </span>
      <ChevronRightIcon size={16} className="shrink-0 text-muted transition-colors group-hover:text-fg" />
    </Link>
  );
}
