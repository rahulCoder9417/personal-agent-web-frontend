"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Automation, Conversation, Message } from "@/lib/api/client";
import { useAgentProgress, useAgentStatus, useThread } from "@/lib/api/hooks";
import { updateDrafts, useCatchUpWhileQuiet, useDrafts } from "@/lib/api/stream";
import { nextRunLine } from "@/lib/automations";
import { inboundStatusWord, useAnsweredHere, waitingForTexUntil } from "@/lib/chat-thread";
import { isAutomationsChat, readOnlyNote } from "@/lib/conversations";
import type { ProgressLine } from "@/lib/crew";
import { answerInThread, type DraftStep, stepLine, stepsToShow, trailLine, turnAnswered, turnOnScreen } from "@/lib/drafts";
import { CHANNEL_LABEL, cn, formatDate, formatDay, formatTime } from "@/lib/format";
import { useInView } from "@/lib/in-view";
import { footAtWork, threadFoot, turnQuestion } from "@/lib/turn-line";
import { BrandIcon } from "../brand-icon";
import { ChevronRightIcon, FileIcon } from "../icons";
import { GettingStartedCard, useGettingStarted } from "../onboarding/getting-started";
import { AgentFigure } from "../tex";
import { Button, ButtonLink, EmptyState, ErrorState, Spinner } from "../ui";
import { AgentBubble } from "./agent-bubble";
import { ApprovalQuestion, useApproval } from "./approval-card";
import { DraftQuestion } from "./draft-card";
import { TurnLine } from "./turn-line";

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

/** A message's channel, time and status. `extra` goes at the end of the line (a reply's trail of steps). */
function MetaLine({ message, align, extra }: { message: Message; align: "start" | "end"; extra?: ReactNode }) {
  const status = message.direction === "in" ? inboundStatusWord(message) : message.status === "failed" ? "not delivered" : undefined;
  return (
    <p className={cn("flex items-center gap-1.5 text-[12px] text-muted tabular-nums", align === "end" && "justify-end")}>
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

/**
 * One message. The spacing is the same everywhere in the thread: a bubble and the card it carries
 * are 8px apart, the line of channel and time is 6px under them and starts at their edge (Tex's on
 * the left, the person's on the right), and messages are 20px apart.
 */
function BubbleBody({ message, stepsToggle, steps }: { message: Message; stepsToggle?: ReactNode; steps?: ReactNode }) {
  if (message.direction === "in") {
    return (
      <div className="flex flex-col items-end gap-1.5">
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
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        {message.approvalId ? (
          <ApprovalQuestion text={message.text} approvalId={message.approvalId} />
        ) : message.automationDraftId ? (
          // Tex proposed an automation: its card, with Save.
          <DraftQuestion message={message} draftId={message.automationDraftId} />
        ) : (
          // What Tex wrote may be Markdown; what the person wrote, above, is always shown as typed.
          <AgentBubble text={message.text}>
            <Attachments message={message} />
          </AgentBubble>
        )}
        <MetaLine message={message} align="start" extra={stepsToggle} />
        {steps}
      </div>
    </div>
  );
}

/**
 * The steps of a turn, as a trail of muted lines: each one what Tex did ("Checked your inbox"), or
 * what it wrote and then started over from (one line, cut short), with the crew's lines under it. The
 * same step done several times in a row is one line with a count ("Read a web page ×16"). The last
 * `STEPS_SHOWN` lines are there; earlier ones fold into "+N earlier steps", which opens them, and
 * "Hide earlier steps" folds them again. Only a click changes that: new steps arriving never do. While
 * the turn is written (`live`) screen readers skip them, as they skip the draft. `className` places it.
 */
export function StepTrail({ steps, live, className }: { steps: readonly DraftStep[]; live?: boolean; className?: string }) {
  const [all, setAll] = useState(false);
  const listId = useId();
  const { shown, earlier } = stepsToShow(steps, all);
  return (
    <div aria-hidden={live || undefined} className={cn("flex min-w-0 flex-col gap-1 border-l-2 border-line pl-3 text-[13px] text-muted", className)}>
      {earlier > 0 && (
        // Open, a long trail can run past the top of the thread: its "Hide" stays in view.
        <div className={cn("flex", all && "sticky top-0 z-[1] bg-surface py-0.5")}>
          <button
            type="button"
            tabIndex={live ? -1 : undefined}
            aria-expanded={all}
            aria-controls={listId}
            onClick={() => setAll((was) => !was)}
            className="text-[12px] font-medium transition-colors hover:text-fg"
          >
            {all ? "Hide earlier steps" : `+${earlier} earlier ${earlier === 1 ? "step" : "steps"}`}
          </button>
        </div>
      )}
      <ol id={listId} className="flex min-w-0 flex-col gap-1">
        {shown.map(({ step, times, first }) => (
          <li key={first} className="flex min-w-0 flex-col gap-0.5 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none">
            {step.text && (
              <span className="flex min-w-0 items-baseline gap-1">
                <span className={cn("truncate", step.action && "text-fg-2")}>{stepLine(step.text)}</span>
                {times > 1 && <span className="shrink-0 text-[12px] tabular-nums">×{times}</span>}
              </span>
            )}
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

/** The steps of a finished turn: a region that opens and shuts. */
function StepsRegion({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid w-full transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * The one line a message carries about the turn whose steps folded into it: "Checked your inbox · 2
 * steps" (`trailLine`), which opens the steps and shuts them again. It starts shut.
 */
function TrailToggle({ steps, open, onToggle, controls }: { steps: readonly DraftStep[]; open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      title={open ? "Hide the steps" : "Show the steps"}
      onClick={onToggle}
      className="inline-flex max-w-[min(62vw,380px)] items-center gap-1 align-bottom font-medium text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
    >
      <span className="truncate">{trailLine(steps)}</span>
      <ChevronRightIcon size={11} className={cn("shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-90")} />
    </button>
  );
}

/**
 * A message with the steps of the turn before it folded into it. On Tex's answer (or question) the
 * trail is on its line of channel and time, and the steps open under it, so the answer stays where
 * its draft was; on anything else (the next message, when a turn ended without an answer) the trail
 * is a line of its own above it.
 */
function BubbleWithSteps({ message, steps }: { message: Message; steps: readonly DraftStep[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const toggle = <TrailToggle steps={steps} open={open} onToggle={() => setOpen((was) => !was)} controls={id} />;
  if (message.direction === "out") {
    return (
      <BubbleBody
        message={message}
        stepsToggle={toggle}
        steps={
          <StepsRegion id={id} open={open}>
            <StepTrail steps={steps} className="pt-0.5 pb-1" />
          </StepsRegion>
        }
      />
    );
  }
  return (
    <div className="flex flex-col">
      <p className="ml-[42px] pb-1.5 text-[12px]">{toggle}</p>
      <StepsRegion id={id} open={open}>
        <StepTrail steps={steps} className="ml-[42px] pb-2" />
      </StepsRegion>
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
 * takes its place, in the same place and at the same width). "Tex is writing…" is the turn's line
 * under it (`TurnLine`). Screen readers hear once that Tex is writing, not every few words; the
 * answer is read out when it arrives.
 */
function Writing({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <TexAvatar working />
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <AgentBubble text={text} writing />
      </div>
    </div>
  );
}

/**
 * The turn being written in this conversation: its steps, then the text being written or, before
 * anything of the turn is on screen (`start`), the "working" bubble. Between two runs of text the
 * turn's line under them says Tex is at work (`TurnLine`). After a turn that ended without its
 * answer, only the steps are left, until the next message.
 */
function TurnInProgress({ steps, writing, start, lines }: { steps: readonly DraftStep[]; writing: string | null; start: boolean; lines: ProgressLine[] }) {
  return (
    <div className="flex flex-col">
      {steps.length > 0 && <StepTrail steps={steps} live className="ml-[42px] pb-2" />}
      {writing !== null ? <Writing text={writing} /> : start && <Working lines={lines} />}
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
 * The time to judge something by that lasts until `until`: read when the thread opens, and again just
 * after `until` has passed, so what depended on it is drawn again then. Between the two it may be
 * old, which is harmless here: anything said since it was read lasts until later than it.
 */
function useTimeAt(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, until - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [until]);
  return now;
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
  const status = useAgentStatus().data;
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
  // Tex asked a question in its latest turn (an approval card, maybe with a line after it): its
  // approval says whether Tex waits for the person's OK, or works on the answer.
  const question = turnQuestion(newestFirst);
  const asked = useApproval(question).data;
  const answeredHere = useAnsweredHere(question);
  // A message that waits for Tex shows Tex at work from the moment it is sent, for a while
  // (`waitingForTexUntil`): the thread is drawn again when that ends.
  const now = useTimeAt(waitingForTexUntil(status?.state, newestFirst));

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
  // The foot of the turn: Tex at work from Send, then one line from its first step or draft until it
  // is over (only a turn in this conversation shows here, not one in another chat).
  const foot = threadFoot({ status, messages: newestFirst, approval: asked, answeredHere, turn, now });
  // A live connection that has gone quiet while Tex works here: the thread and the agent's state are
  // asked for again, so the answer shows even when the turn's events are slow to come.
  useCatchUpWhileQuiet(footAtWork(foot), conversationId);

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
  }, [count, newestId, foot, writing, stepCount, empty]);

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
      <div ref={content} className="mx-auto flex min-h-full max-w-[944px] flex-col gap-5 px-4 pt-2 pb-5 md:px-8" aria-live="polite">
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
          <div key={message.id} className="flex flex-col gap-5">
            {startsDay && <DayDivider iso={message.createdAt} />}
            <Bubble message={message} steps={stepsOf(message.id)} />
          </div>
        ))}

        {(stepCount > 0 || writing !== null || foot === "start") && (
          <TurnInProgress steps={turn?.steps ?? []} writing={writing} start={foot === "start"} lines={progress} />
        )}
        {/* In the same place for the whole turn, so it is never taken away and put back while the turn runs. */}
        {foot !== null && foot !== "start" && <TurnLine foot={foot} lines={foot === "working" && stepCount === 0 ? progress : []} />}
      </div>
    </div>
  );
}
