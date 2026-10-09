"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Conversation, Message } from "@/lib/api/client";
import { useAgentProgress, useAgentStatus, useThread } from "@/lib/api/hooks";
import { threadIsWorking } from "@/lib/chat-thread";
import { readOnlyNote } from "@/lib/conversations";
import type { ProgressLine } from "@/lib/crew";
import { CHANNEL_LABEL, cn, formatDate, formatDay, formatTime } from "@/lib/format";
import { useInView } from "@/lib/in-view";
import { BrandIcon } from "../brand-icon";
import { FileIcon } from "../icons";
import { AgentFigure } from "../tex";
import { Button, EmptyState, ErrorState, Spinner } from "../ui";
import { ApprovalCard } from "./approval-card";

const STATUS_WORDS: Partial<Record<Message["status"], string>> = {
  queued: "sending",
  processing: "Tex is on it",
  delivered: "delivered",
  read: "read",
  failed: "not sent",
};

function dayLabel(iso: string): string {
  const day = formatDay(iso);
  const date = new Date(iso);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  return day === "Today" || day === "Yesterday" ? `${day}, ${weekday} ${formatDate(iso)}` : day;
}

function Attachments({ message, onDark }: { message: Message; onDark?: boolean }) {
  if (!message.attachments?.length) return null;
  return (
    <ul className="mb-1.5 flex flex-wrap gap-1.5">
      {message.attachments.map((file) => (
        <li
          key={file.id ?? file.name}
          className={cn(
            "flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[12px]",
            onDark ? "bg-white/15" : "bg-surface-2",
          )}
        >
          <FileIcon size={13} />
          <span className="truncate">{file.name ?? "File"}</span>
        </li>
      ))}
    </ul>
  );
}

function MetaLine({ message, align }: { message: Message; align: "start" | "end" }) {
  const status = message.direction === "in" ? STATUS_WORDS[message.status] : message.status === "failed" ? "not delivered" : undefined;
  return (
    <p className={cn("flex items-center gap-1.5 px-1 text-[12px] text-muted tabular-nums", align === "end" && "justify-end")}>
      <BrandIcon name={message.channel} size={11} />
      <span>
        {CHANNEL_LABEL[message.channel]} · {formatTime(message.createdAt)}
        {status && <span className={message.status === "failed" ? "text-danger" : undefined}> · {status}</span>}
      </span>
    </p>
  );
}

function TexAvatar({ working }: { working?: boolean }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent-soft">
      <AgentFigure who="tex" mood={working ? "working" : "ready"} glyph size={25} label="Tex" />
    </span>
  );
}

function Bubble({ message }: { message: Message }) {
  if (message.direction === "in") {
    return (
      <div className="flex flex-col items-end gap-[5px]">
        <div className="max-w-[78%] rounded-[18px] rounded-br-[6px] bg-fg px-4 py-2.5 text-[14.5px] leading-[1.45] break-words whitespace-pre-wrap text-white">
          <Attachments message={message} onDark />
          {message.text}
        </div>
        <MetaLine message={message} align="end" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <TexAvatar />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[5px]">
        {message.approvalId ? (
          // The backend sends each ask as its own message ("Approval needed: …"); the card says it better.
          <ApprovalCard approvalId={message.approvalId} fallbackText={message.text} />
        ) : (
          <div className="max-w-[560px] rounded-[18px] rounded-bl-[6px] bg-surface-2 px-4 py-2.5 text-[14.5px] leading-[1.45] break-words whitespace-pre-wrap">
            <Attachments message={message} />
            {message.text}
          </div>
        )}
        <MetaLine message={message} align="start" />
      </div>
    </div>
  );
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <p className="flex items-center gap-3 py-1 text-[12px] font-medium text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      {dayLabel(iso)}
    </p>
  );
}

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * What Tex is doing while it works. Until a progress line arrives it just says so; then it shows
 * the latest line of each crew member at work, so it is clear who is on what.
 */
function Working({ lines }: { lines: ProgressLine[] }) {
  return (
    <div className="flex items-start gap-2.5">
      <TexAvatar working />
      <div className="flex min-w-0 max-w-[560px] flex-col gap-1.5 rounded-[18px] rounded-bl-[6px] bg-surface-2 px-4 py-2.5 text-[13.5px] text-muted">
        {lines.length === 0
          ? "Tex is working…"
          : lines.map((line) => (
              <span key={line.who} className="flex min-w-0 items-center gap-2">
                <AgentFigure who={line.who} mood="working" glyph size={18} label="" className="shrink-0" />
                <span className="min-w-0 break-words">
                  <span className="font-medium text-fg">{line.name}</span> · {line.text}
                </span>
              </span>
            ))}
      </div>
    </div>
  );
}

/** What an open conversation with nothing in it says. */
function emptyWords(conversation: Conversation | null, hasHistory: boolean): { title: string; body: string } {
  if (conversation && conversation.channel !== "web") {
    return { title: "Nothing here yet", body: `${readOnlyNote(conversation.channel)}. What you say there shows up here.` };
  }
  if (hasHistory) {
    return { title: "A new chat", body: "Tex starts afresh here: it doesn’t see what was said in your other chats. What you’ve asked it to remember stays." };
  }
  return { title: "Say hi to Tex", body: "Ask for anything you’d hand to an assistant: move a meeting, chase an invoice, file your notes." };
}

/**
 * One conversation's messages, oldest at the top. It follows new messages while you're at the
 * bottom, and asks for earlier ones as you scroll up to them.
 *
 * `conversation` is null when there is none to show: while the history is on its way (`loading`),
 * or before anything was ever said in web chat. `hasHistory` is whether there are other chats.
 * The chat screen gives each conversation its own Thread (a `key`), so every one opens at its
 * newest message.
 */
export function Thread({ conversation, loading, hasHistory }: { conversation: Conversation | null; loading: boolean; hasHistory: boolean }) {
  const query = useThread(conversation?.id ?? null);
  const busy = useAgentStatus().data?.state === "busy";
  const progress = useAgentProgress().data;
  const scroller = useRef<HTMLDivElement>(null);
  const older = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);

  const newestFirst = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  // The API lists newest first; the thread reads top to bottom.
  // A row also knows whether it starts a new day, so the divider needs no bookkeeping while rendering.
  const messages = useMemo(() => {
    const ordered = newestFirst.slice().reverse();
    return ordered.map((message, index) => ({
      message,
      startsDay: index === 0 || !sameDay(ordered[index - 1].createdAt, message.createdAt),
    }));
  }, [newestFirst]);
  const newestId = messages[messages.length - 1]?.message.id;
  const count = messages.length;
  // Only a turn in this conversation shows here, not one in another chat.
  const working = threadIsWorking(busy, newestFirst);

  const waiting = loading || (conversation !== null && query.isPending);
  const failed = conversation !== null && query.isError && !query.data;
  const empty = !waiting && !failed && count === 0;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (heightBeforeOlder.current !== null) {
      // Older messages were added above: keep what was on screen where it was.
      el.scrollTop += el.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [count, newestId, working]);

  // Content can grow after it first renders (an approval card loading, a font swapping in).
  // While following, stay pinned to the newest message through that too.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const loadOlder = () => {
    heightBeforeOlder.current = scroller.current?.scrollHeight ?? null;
    void query.fetchNextPage();
  };
  // Scrolling up to the top of what is loaded asks for the page before it. After a page that
  // failed, the button is left to ask again, so it doesn't try over and over.
  useInView(older, loadOlder, query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError);

  const words = emptyWords(conversation, hasHistory);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="scroll-pane min-h-0 flex-1 overflow-y-auto"
    >
      <div ref={content} className="mx-auto flex min-h-full max-w-[760px] flex-col gap-3.5 px-4 pt-2 pb-5 md:px-8" aria-live="polite">
        {waiting && (
          <div className="m-auto text-muted">
            <Spinner size={20} />
          </div>
        )}
        {failed && <ErrorState error={query.error} onRetry={() => query.refetch()} className="m-auto w-full" />}

        {empty && (
          <EmptyState mood="ready" title={words.title} className="m-auto w-full border-0">
            {words.body}
          </EmptyState>
        )}

        {query.hasNextPage && (
          <div ref={older} className="flex justify-center">
            <Button size="sm" variant="ghost" onClick={loadOlder} pending={query.isFetchingNextPage}>
              {query.isFetchNextPageError ? "Couldn’t load earlier messages. Try again" : "Load earlier messages"}
            </Button>
          </div>
        )}

        {messages.map(({ message, startsDay }) => (
          <div key={message.id} className="flex flex-col gap-[13px]">
            {startsDay && <DayDivider iso={message.createdAt} />}
            <Bubble message={message} />
          </div>
        ))}

        {working && count > 0 && <Working lines={progress} />}
      </div>
    </div>
  );
}
