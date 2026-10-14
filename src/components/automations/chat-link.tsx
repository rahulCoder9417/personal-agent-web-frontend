"use client";

import Link from "next/link";
import { useAutomationsChat } from "@/lib/api/hooks";
import { useAutomationsUnread } from "@/lib/automations-seen";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { cn } from "@/lib/format";
import { AutomationsIcon, ChevronRightIcon } from "../icons";

/**
 * The way from the Automations screen to the Automations chat, where every run answers: the
 * results and the history of every automation. It shows the chat's mark when a run arrived there
 * since it was last open.
 */
export function AutomationsChatLink({ className }: { className?: string }) {
  const chat = useAutomationsChat().data ?? null;
  const unread = useAutomationsUnread(chat, false);
  return (
    <Link
      href={AUTOMATIONS_CHAT_HREF}
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-fg/30 hover:bg-surface-2",
        className,
      )}
    >
      <span aria-hidden className="relative grid size-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent">
        <AutomationsIcon size={18} />
        {unread && <span data-unread className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-fg">
          {unread ? "New results in the Automations chat" : "Results are in the Automations chat"}
          {unread && <span className="sr-only"> (new runs)</span>}
        </span>
        <span className="text-[12.5px] text-muted">
          Every run posts there, pinned at the top of your chats. Write there to follow one up. One made on Telegram also sends each result to
          Telegram.
        </span>
      </span>
      <ChevronRightIcon size={16} className="shrink-0 text-muted transition-colors group-hover:text-fg" />
    </Link>
  );
}
