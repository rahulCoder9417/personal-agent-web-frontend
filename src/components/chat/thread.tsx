"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Automation, Conversation, Message } from "@/lib/api/client";
import { useAgentProgress, useAgentStatus, useThread } from "@/lib/api/hooks";
import { updateDrafts, useDrafts } from "@/lib/api/stream";
import { nextRunLine } from "@/lib/automations";
import { threadIsWorking } from "@/lib/chat-thread";
import { isAutomationsChat, readOnlyNote } from "@/lib/conversations";
import type { ProgressLine } from "@/lib/crew";
import { answerInThread, type DraftStep, stepLine, stepsToShow, turnAnswered, turnOnScreen } from "@/lib/drafts";
import { CHANNEL_LABEL, cn, formatDate, formatDay, formatTime } from "@/lib/format";
import { useInView } from "@/lib/in-view";
import { BrandIcon } from "../brand-icon";
import { FileIcon } from "../icons";
import { GettingStartedCard, useGettingStarted } from "../onboarding/getting-started";
import { AgentFigure } from "../tex";
import { Button, ButtonLink, EmptyState, ErrorState, Spinner } from "../ui";
import { AgentBubble } from "./agent-bubble";
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

/** A message's channel, time and status. `extra` goes at the end of the line (a reply's "Show steps"). */
function MetaLine({ message, align, extra }: { message: Message; align: "start" | "end"; extra?: ReactNode }) {
  const status = message.direction === "in" ? STATUS_WORDS[message.status] : message.status === "failed" ? "not delivered" : undefined;
  return (
    <p className={cn("flex items-center gap-1.5 px-1 text-[12px] text-muted tabular-nums", align === "end" && "justify-end")}>
      <BrandIcon name={message.channel} size={11} />
      <span>
        {CHANNEL_LABEL[message.channel]} · {formatTime(message.createdAt)}
        {status && <span className={message.status === "failed" ? "text-danger" : undefined}> · {status}</span>}
        {extra && <> · {extra}</>}
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

function BubbleBody({ message, stepsToggle }: { message: Message; stepsToggle?: ReactNode }) {
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
          // What Tex wrote may be Markdown; what the person wrote, above, is always shown as typed.
          <AgentBubble text={message.text}>
            <Attachments message={message} />
          </AgentBubble>
        )}
        <MetaLine message={message} align="start" extra={stepsToggle} />
      </div>
    </div>
  );
}

/**
 * The steps of a turn, as a trail of muted lines beside the bubble: each one what Tex wrote and then
 * started over from (one line, cut short), with what it went on to do under it. The last
 * `STEPS_SHOWN` are there; earlier ones fold into "+N earlier steps". While the turn is written
 * (`live`) screen readers skip them, as they skip the draft.
 */
function StepTrail({ steps, live }: { steps: readonly DraftStep[]; live?: boolean }) {
  const [all, setAll] = useState(false);
  const { shown, earlier } = stepsToShow(steps, all);
  return (
    <div aria-hidden={live || undefined} className="ml-[42px] flex min-w-0 flex-col gap-1 border-l-2 border-line pb-2 pl-3 text-[13px] text-muted">
      {earlier > 0 && (
        <button
          type="button"
          tabIndex={live ? -1 : undefined}
          onClick={() => setAll(true)}
          className="self-start text-[12px] font-medium transition-colors hover:text-fg"
        >
          +{earlier} earlier {earlier === 1 ? "step" : "steps"}
        </button>
      )}
      <ol className="flex min-w-0 flex-col gap-1">
        {shown.map((step, index) => (
          <li key={earlier + index} className="flex min-w-0 flex-col gap-0.5 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none">
            <span className="truncate">{stepLine(step.text)}</span>
            {step.progress.map((line) => (
              <span key={line.who} className="flex min-w-0 items-center gap-1.5 text-[12px]">
                <AgentFigure who={line.who} mood="working" glyph size={14} label="" className="shrink-0" />
                <span className="truncate">
                  <span className="font-medium text-fg-2">{line.name}</span> · {line.text}
                </span>
              </span>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Answers whose steps have folded once (this session): drawn again, after another chat was open, they start folded. */
const foldedOnce = new Set<string>();

/**
 * Whether an answer's steps are open. The answer took the place of what was being written, with the
 * steps above it, so they start open and fold away at once, smoothly (`StepsRegion`).
 */
function useStepsOpen(messageId: string) {
  const [fresh] = useState(() => !foldedOnce.has(messageId));
  const [open, setOpen] = useState(fresh);
  useEffect(() => {
    if (!fresh) return;
    foldedOnce.add(messageId);
    // Two frames, so the steps are drawn open once before they fold.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setOpen(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [fresh, messageId]);
  return [open, setOpen] as const;
}

/** The steps of an answer: a region that folds shut to nothing and opens again. */
function StepsRegion({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * A message with the steps of the turn before it folded into it: "Show steps (N)" opens them again.
 * On Tex's answer the button is on its line of channel and time, so the answer sits exactly where its
 * draft was; on anything else (the next message, when a turn ended without an answer) it is a line of its own.
 */
function BubbleWithSteps({ message, steps }: { message: Message; steps: readonly DraftStep[] }) {
  const id = useId();
  const [open, setOpen] = useStepsOpen(message.id);
  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen((was) => !was)}
      className="font-medium text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
    >
      {open ? "Hide steps" : `Show steps (${steps.length})`}
    </button>
  );
  const region = (
    <StepsRegion id={id} open={open}>
      <StepTrail steps={steps} />
    </StepsRegion>
  );
  if (message.direction === "out") {
    return (
      <div className="flex flex-col">
        {region}
        <BubbleBody message={message} stepsToggle={toggle} />
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <p className="ml-[42px] pb-1.5 text-[12px]">{toggle}</p>
      {region}
      <BubbleBody message={message} />
    </div>
  );
}

function Bubble({ message, steps }: { message: Message; steps?: readonly DraftStep[] }) {
  return steps?.length ? <BubbleWithSteps message={message} steps={steps} /> : <BubbleBody message={message} />;
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

/**
 * Tex's answer as it is written (`message.draft`), in place of the "working" bubble: drawn the way
 * the answer will be, Markdown included (half-written Markdown reads well enough until the answer
 * takes its place, in the same place and at the same width). Screen readers hear once that Tex is
 * writing, not every few words; the answer is read out when it arrives.
 */
function Writing({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <TexAvatar working />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[5px]">
        <AgentBubble text={text} writing />
        <p className="flex items-center gap-1.5 px-1 text-[12px] text-muted">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
          Tex is writing…
        </p>
      </div>
    </div>
  );
}

/**
 * The turn being written in this conversation: its steps, then the text being written or, between
 * two runs of text, the "working" bubble. With steps on screen, a progress line shows under the
 * step it follows, so the bubble just says that Tex is at work. After a turn that ended without its
 * answer, only the steps are left, until the next message.
 */
function TurnInProgress({ steps, writing, working, lines }: { steps: readonly DraftStep[]; writing: string | null; working: boolean; lines: ProgressLine[] }) {
  return (
    <div className="flex flex-col">
      {steps.length > 0 && <StepTrail steps={steps} live />}
      {writing !== null ? <Writing text={writing} /> : working && <Working lines={steps.length > 0 ? [] : lines} />}
    </div>
  );
}

/**
 * The Automations chat before the backend has started it (the person's automations were all made
 * before it existed, and none has run since): a calm word on what will come here, the next run, and
 * the way to the automations. Nothing can be written here yet.
 */
export function AutomationsWaiting({ automations }: { automations: readonly Automation[] }) {
  return (
    <div className="scroll-pane flex min-h-0 flex-1 overflow-y-auto">
      <EmptyState
        mood="ready"
        title="No runs yet"
        className="m-auto w-full border-0"
        action={
          <ButtonLink href="/automations" size="sm">
            See your automations
          </ButtonLink>
        }
      >
        <p>Runs of your automations will appear here, not in your other chats.</p>
        <p data-next-run className="mt-1.5 font-medium text-fg-2">
          {nextRunLine(automations)}
        </p>
      </EmptyState>
    </div>
  );
}

/** What an open conversation with nothing in it says. */
function emptyWords(conversation: Conversation | null, hasHistory: boolean): { title: string; body: string } {
  if (conversation && conversation.channel !== "web") {
    return { title: "Nothing here yet", body: `${readOnlyNote(conversation.channel)}. What you say there shows up here.` };
  }
  if (isAutomationsChat(conversation)) {
    return {
      title: "No runs yet",
      body: "When one of your automations runs, its result shows up here, not in your other chats. Write here to follow up: Tex has the runs in mind.",
    };
  }
  if (hasHistory) {
    return { title: "A new chat", body: "Tex starts afresh here: it doesn’t see what was said in your other chats. What you’ve asked it to remember stays." };
  }
  return { title: "Say hi to Tex", body: "Ask for anything you’d hand to an assistant: move a meeting, chase an invoice, file your notes." };
}

/**
 * An empty web conversation: Tex, a word on what to ask, and, until it is done or hidden, the
 * "Getting started" checklist under it.
 */
function EmptyWebChat({ title, body }: { title: string; body: string }) {
  const setup = useGettingStarted();
  if (!setup.visible) {
    return (
      <EmptyState mood="ready" title={title} className="m-auto w-full border-0">
        {body}
      </EmptyState>
    );
  }
  // With the checklist under it, Tex and the words take less room, so the list is in view.
  return (
    <div className="m-auto flex w-full max-w-[540px] flex-col items-center gap-5 py-4 md:py-6">
      <div className="flex flex-col items-center gap-1.5 px-4 text-center">
        <AgentFigure who="tex" mood="ready" size={84} label="" />
        <p className="text-[16px] font-semibold tracking-[-0.01em]">{title}</p>
        <p className="max-w-sm text-[13.5px] text-muted">{body}</p>
      </div>
      <GettingStartedCard setup={setup} className="w-full" />
    </div>
  );
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
  const qc = useQueryClient();
  const query = useThread(conversation?.id ?? null);
  const busy = useAgentStatus().data?.state === "busy";
  const progress = useAgentProgress().data;
  const drafts = useDrafts();
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

  // What Tex is writing in this conversation right now, and the steps before it.
  const onScreen = turnOnScreen(drafts, conversation?.id ?? null);
  // The turn's answer may be in the thread already without its event (it came with the thread asked
  // for again after the stream was down): the steps fold into it, as they would have.
  const answeredBy = onScreen ? answerInThread(newestFirst, onScreen.turn) : null;
  const conversationId = conversation?.id ?? null;
  useEffect(() => {
    if (conversationId && answeredBy) updateDrafts(qc, (all) => turnAnswered(all, conversationId, answeredBy));
  }, [qc, conversationId, answeredBy]);
  const turn = answeredBy ? null : onScreen;
  const stepsOf = (messageId: string) => drafts.folded[messageId] ?? (messageId === answeredBy ? onScreen?.steps : undefined);
  const writing = turn?.writing ?? null;
  const stepCount = turn?.steps.length ?? 0;
  // A turn with no incoming message of its own here (an automation's run) is at work while it runs.
  const showWorking = writing === null && ((working && count > 0) || (turn?.live === true && busy && stepCount > 0));

  const waiting = loading || (conversation !== null && query.isPending);
  const failed = conversation !== null && query.isError && !query.data;
  const empty = !waiting && !failed && count === 0 && !turn;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (empty) {
      // Nothing said yet: what is shown (Tex, the checklist) is read from its top, not followed to its foot.
      el.scrollTop = 0;
    } else if (heightBeforeOlder.current !== null) {
      // Older messages were added above: keep what was on screen where it was.
      el.scrollTop += el.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [count, newestId, showWorking, writing, stepCount, empty]);

  // Content can grow after it first renders (an approval card loading, a font swapping in).
  // While following, stay pinned to the newest message through that too.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const observer = new ResizeObserver(() => {
      if (stick.current && !empty) el.scrollTop = el.scrollHeight;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [empty]);

  const loadOlder = () => {
    heightBeforeOlder.current = scroller.current?.scrollHeight ?? null;
    void query.fetchNextPage();
  };
  // Scrolling up to the top of what is loaded asks for the page before it. After a page that
  // failed, the button is left to ask again, so it doesn't try over and over.
  useInView(older, loadOlder, query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError);

  const words = emptyWords(conversation, hasHistory);
  // Where the person writes: before the first message, or an empty web conversation of their own.
  const webChat = conversation === null || (conversation.channel === "web" && !isAutomationsChat(conversation));

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="scroll-pane min-h-0 flex-1 overflow-y-auto"
    >
      <div ref={content} className="mx-auto flex min-h-full max-w-[944px] flex-col gap-3.5 px-4 pt-2 pb-5 md:px-8" aria-live="polite">
        {waiting && (
          <div className="m-auto text-muted">
            <Spinner size={20} />
          </div>
        )}
        {failed && <ErrorState error={query.error} onRetry={() => query.refetch()} className="m-auto w-full" />}

        {empty &&
          (webChat ? (
            <EmptyWebChat title={words.title} body={words.body} />
          ) : (
            <EmptyState mood="ready" title={words.title} className="m-auto w-full border-0">
              {words.body}
            </EmptyState>
          ))}

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
            <Bubble message={message} steps={stepsOf(message.id)} />
          </div>
        ))}

        {(stepCount > 0 || writing !== null || showWorking) && (
          <TurnInProgress steps={turn?.steps ?? []} writing={writing} working={showWorking} lines={progress} />
        )}
      </div>
    </div>
  );
}
