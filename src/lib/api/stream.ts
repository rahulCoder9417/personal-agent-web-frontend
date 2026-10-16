"use client";

import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { addProgress, progressLine, type ProgressLine } from "../crew";
import {
  draftArrived,
  DRAFTS_KEY,
  type Drafts,
  messageArrived,
  messageSettled,
  NO_DRAFTS,
  progressArrived,
  runRevealed,
  SHOW_AFTER_MS,
  turnsOver,
  turnsOverAfterReconnect,
} from "../drafts";
import { threadIsWorking } from "../chat-thread";
import type { AgentProgress, AgentStatus, Approval, AutomationDraft, AutomationRun, Conversation, CreditBalance, Message, MessageDraft, StreamEvent, StreamReady } from "./client";
import { addMessage, cachedThread, invalidateAutomations, noteAgentStatusEvent, noteDraft, noteRun, qk, removeConversation, upsertConversation, upsertMessage } from "./hooks";

const EVENT_TYPES: StreamEvent["type"][] = [
  "message.created",
  "message.status",
  "message.draft",
  "approval.created",
  "approval.resolved",
  "agent.status",
  "agent.progress",
  "credits.updated",
  "automation.updated",
  "automation_draft.updated",
  "automation_run.updated",
  "conversation.updated",
  "conversation.deleted",
];

export type StreamListener = (event: StreamEvent) => void;

/**
 * After the stream comes back (the hosting cuts it at the function's time limit, every five
 * minutes on Vercel, and a phone drops it when it sleeps) without the backend replaying what was
 * missed: catch up on what the events keep fresh. The backend replays the events after the last
 * one this tab got (`Last-Event-ID`) when it still holds them, the last 15 minutes or so, and its
 * `ready` then says `resumed`. When it doesn't (away too long, or its record unreadable), whatever
 * was sent while the stream was down is lost, and the lists (the open threads, the chat history,
 * the approvals) have to be asked for again. In a tab nobody is looking at they are only marked
 * stale, and asked for when the tab is shown again (`refetchOnWindowFocus`).
 */
export function catchUpAfterReconnect(qc: QueryClient, visible: boolean) {
  const refetchType = visible ? "active" : "none";
  void qc.invalidateQueries({ queryKey: ["messages"], refetchType });
  void qc.invalidateQueries({ queryKey: qk.conversations, refetchType });
  void qc.invalidateQueries({ queryKey: ["approvals"], refetchType });
  // Progress is live only, so what was on screen may belong to a turn that has since ended.
  qc.setQueryData<ProgressLine[]>(qk.agentProgress, []);
  // What is on screen of a turn stays: if the turn still runs, its next draft carries on from it.
  // If the agent turns out to be idle, the turn ended while the stream was down: it ends here too,
  // and the thread, asked for again, brings its answer (`answerInThread`).
  void qc.invalidateQueries({ queryKey: qk.agentStatus, refetchType }).then(() => {
    const status = qc.getQueryData<AgentStatus>(qk.agentStatus);
    if (status && status.state !== "busy") updateDrafts(qc, turnsOverAfterReconnect);
  });
}

export function updateDrafts(qc: QueryClient, change: (drafts: Drafts) => Drafts) {
  qc.setQueryData<Drafts>(DRAFTS_KEY, (drafts) => change(drafts ?? NO_DRAFTS));
}

const draftsOf = (qc: QueryClient) => qc.getQueryData<Drafts>(DRAFTS_KEY) ?? NO_DRAFTS;

/**
 * A draft arrived. When it starts a run that isn't worth showing yet, the run is looked at again
 * once it has been written for `SHOW_AFTER_MS`: still being written by then, it is shown.
 */
function draftReceived(qc: QueryClient, draft: MessageDraft) {
  const before = draftsOf(qc).turns[draft.conversationId]?.run;
  updateDrafts(qc, (drafts) => draftArrived(drafts, draft, Date.now()));
  const run = draftsOf(qc).turns[draft.conversationId]?.run;
  if (!run || run.shown || run.no === before?.no) return;
  const { conversationId, turnId } = draft;
  setTimeout(() => updateDrafts(qc, (drafts) => runRevealed(drafts, conversationId, turnId, run.no)), SHOW_AFTER_MS);
}

/**
 * Tex's turns as the chat threads show them while they are written (`message.draft` on the live
 * stream): the text being written and the steps before it, and the steps folded into each answer.
 * Live only: never asked for, and not there after a reload (`src/lib/drafts.ts`).
 */
export function useDrafts(): Drafts {
  return useQuery<Drafts>({ queryKey: DRAFTS_KEY, queryFn: () => NO_DRAFTS, enabled: false, initialData: NO_DRAFTS, staleTime: Infinity }).data;
}

/**
 * Tex's answer is sent a moment before its turn ends: the turn's last events (the person's message
 * `delivered`, the agent no longer `busy`) follow within a second or two. If they haven't arrived
 * this long after the answer, they were lost on the way, and the thread would show Tex at work on a
 * finished turn until the stream next reconnects.
 */
export const SETTLE_CHECK_MS = 10_000;

/**
 * Tex wrote in a conversation (not a question: that pauses the turn). If its thread still shows Tex
 * at work on the person's message `SETTLE_CHECK_MS` later, the agent's state and the thread are
 * asked for again: the API says whether the turn ended. A turn that is still running (Tex said "on
 * it" and carries on) stays at work, as the API says so too.
 */
function checkTurnSettles(qc: QueryClient, message: Message) {
  if (message.direction !== "out" || message.approvalId) return;
  const { conversationId } = message;
  const stillWorking = () =>
    threadIsWorking(qc.getQueryData<AgentStatus>(qk.agentStatus)?.state === "busy", cachedThread(qc, conversationId) ?? []);
  setTimeout(() => {
    if (!stillWorking()) return;
    void qc.invalidateQueries({ queryKey: qk.agentStatus });
    void qc.invalidateQueries({ queryKey: qk.thread(conversationId) });
  }, SETTLE_CHECK_MS);
}

/** Folds one event from the live stream into the query cache, so every screen shows it. */
export function applyStreamEvent(qc: QueryClient, event: StreamEvent) {
  switch (event.type) {
    case "message.created":
      // The message carries its conversation: it joins that thread, and the conversation moves up.
      addMessage(qc, event.data as Message);
      // Tex's answer takes the place of what was shown of it while it was written, and the steps fold into it.
      updateDrafts(qc, (drafts) => messageArrived(drafts, event.data as Message));
      checkTurnSettles(qc, event.data as Message);
      break;
    case "message.status":
      upsertMessage(qc, event.data as Message);
      updateDrafts(qc, (drafts) => messageSettled(drafts, event.data as Message));
      break;
    case "message.draft":
      // Live only: the whole answer so far, while Tex writes it in a web chat turn.
      draftReceived(qc, event.data as MessageDraft);
      break;
    case "conversation.updated":
      // A new one, a new title, something said in it, or it became (or stopped being) the active one.
      upsertConversation(qc, event.data as Conversation);
      break;
    case "conversation.deleted":
      removeConversation(qc, (event.data as Conversation).id);
      break;
    case "approval.created":
    case "approval.resolved":
      void qc.invalidateQueries({ queryKey: ["approvals"] });
      void qc.invalidateQueries({ queryKey: qk.activity });
      // Keep the freshest copy handy for the chat card.
      qc.setQueryData(["approval", (event.data as Approval).id], event.data);
      break;
    case "agent.status": {
      const status = event.data as AgentStatus;
      noteAgentStatusEvent(qc);
      qc.setQueryData(qk.agentStatus, status);
      if (status.state !== "busy") {
        // The turn is over: its progress lines have nothing more to say, and nothing is being written.
        qc.setQueryData<ProgressLine[]>(qk.agentProgress, []);
        updateDrafts(qc, turnsOver);
        // Memory has no event of its own; a turn is when Tex saves, corrects or forgets.
        void qc.invalidateQueries({ queryKey: qk.memories });
      }
      break;
    }
    case "agent.progress": {
      // Live only: a short line about what the agent, or one of the crew, is doing right now.
      const line = progressLine(event.data as AgentProgress);
      qc.setQueryData<ProgressLine[]>(qk.agentProgress, (lines) => addProgress(lines ?? [], line));
      // Under the step it follows, when Tex started its draft over to do it.
      updateDrafts(qc, (drafts) => progressArrived(drafts, line));
      break;
    }
    case "credits.updated":
      qc.setQueryData(qk.credits, event.data as CreditBalance);
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.ledger });
      break;
    case "automation.updated":
      void invalidateAutomations(qc);
      break;
    case "automation_draft.updated": {
      // A draft Tex proposed, saved, discarded, replaced or expired: its card and page follow.
      const draft = event.data as AutomationDraft;
      noteDraft(qc, draft);
      if (draft.status === "saved") void invalidateAutomations(qc);
      break;
    }
    case "automation_run.updated": {
      // A run of an automation with steps started, moved on a step, waits for an OK, or ended: the
      // trail on its canvas follows. When it ended, the automation's last and next run moved too.
      const run = event.data as AutomationRun;
      noteRun(qc, run);
      if (run.state !== "running") void qc.invalidateQueries({ queryKey: qk.automation(run.automationId) });
      break;
    }
  }
}

/**
 * The backend writes a `ping` after 25 seconds without an event. Nothing at all for this long, and
 * the connection is taken to be dead though the browser still holds it open (it can stay that way
 * for minutes, delivering nothing): it is replaced, and the new one catches up.
 */
export const SILENT_MS = 70_000;
/** How often the connection's silence is looked at. */
export const WATCH_EVERY_MS = 10_000;
/**
 * A stream that was refused (the proxy answered 401 or 502, say) is closed for good by the browser,
 * which never tries it again. It is opened again after this long, then twice as long each time
 * it is refused again, up to `REOPEN_MAX_MS`.
 */
export const REOPEN_FIRST_MS = 3_000;
export const REOPEN_MAX_MS = 60_000;
/** `EventSource.CLOSED`: the browser has given the connection up for good. */
const CLOSED = 2;

/** What the live connection needs of the browser, so it can be tried without one. */
export type LiveSource = Pick<EventSource, "addEventListener" | "close" | "readyState">;
export type LiveBrowser = {
  /** Opens a connection; `lastEventId`: the id of the last event the one before it got. */
  open: (lastEventId?: string) => LiveSource;
  /** Whether the page is on screen. */
  visible: () => boolean;
  /** Calls `listener` each time the page is shown or hidden; returns how to stop. */
  onVisibility: (listener: () => void) => () => void;
};

/**
 * Keeps one Server-Sent Events connection open and folds each event into the query cache. Each
 * connection after the first gives the id of the last event received, so the backend sends what
 * came after it first: the browser does so by itself when it reconnects after a dropped connection
 * (the `Last-Event-ID` header), and the connections made here say it in the address, when one has
 * gone silent (`SILENT_MS`; looked at again at once when the page is shown) or was refused for good.
 * When the backend can't replay (`ready` without `resumed`), the connection catches up instead
 * (`catchUpAfterReconnect`). Returns how to close it.
 */
export function connectLive(qc: QueryClient, browser: LiveBrowser, onEvent?: StreamListener): () => void {
  let source: LiveSource | null = null;
  let opened = false;
  let heardAt = Date.now();
  let reopenMs = REOPEN_FIRST_MS;
  let reopenTimer: ReturnType<typeof setTimeout> | undefined;
  // The id of the last event received (a draft has none, and leaves it as it was).
  let lastEventId: string | undefined;

  const open = () => {
    clearTimeout(reopenTimer);
    reopenTimer = undefined;
    source?.close();
    const current = browser.open(lastEventId);
    source = current;
    heardAt = Date.now();
    // Only the newest connection speaks: one replaced may still deliver something as it goes.
    const heard = () => {
      if (source !== current) return false;
      heardAt = Date.now();
      return true;
    };
    current.addEventListener("ready", ((raw: MessageEvent<string>) => {
      if (!heard()) return;
      reopenMs = REOPEN_FIRST_MS;
      // A reconnect the backend could not replay: anything sent while we were away is missing.
      // (The first connect needs nothing: the lists are being asked for the first time.)
      if (opened && !resumed(raw.data)) catchUpAfterReconnect(qc, browser.visible());
      opened = true;
    }) as EventListener);
    current.addEventListener("ping", heard);
    const onMessage = (raw: MessageEvent<string>) => {
      if (!heard()) return;
      if (raw.lastEventId) lastEventId = raw.lastEventId;
      let event: StreamEvent;
      try {
        event = JSON.parse(raw.data) as StreamEvent;
      } catch {
        return;
      }
      applyStreamEvent(qc, event);
      onEvent?.(event);
    };
    for (const type of EVENT_TYPES) current.addEventListener(type, onMessage as EventListener);
    current.addEventListener("error", () => {
      // After a dropped connection the browser tries again by itself. Refused, it gives up.
      if (source !== current || current.readyState !== CLOSED || reopenTimer) return;
      reopenTimer = setTimeout(open, reopenMs);
      reopenMs = Math.min(reopenMs * 2, REOPEN_MAX_MS);
    });
  };

  const silent = () => !reopenTimer && Date.now() - heardAt > SILENT_MS;
  const watch = setInterval(() => {
    if (silent()) open();
  }, WATCH_EVERY_MS);
  // A page put away for a while: its timers may have slept too, so it is looked at as it comes back.
  const stopVisibility = browser.onVisibility(() => {
    if (browser.visible() && silent()) open();
  });
  open();
  return () => {
    clearInterval(watch);
    clearTimeout(reopenTimer);
    stopVisibility();
    source?.close();
    source = null;
  };
}

/** Whether a `ready` says the backend sends every event since the last one received (`StreamReady`). */
function resumed(data: string | undefined): boolean {
  try {
    return (JSON.parse(data ?? "{}") as Partial<StreamReady>).resumed === true;
  } catch {
    return false;
  }
}

const inBrowser: LiveBrowser = {
  open: (lastEventId) =>
    new EventSource(lastEventId ? `/api/v1/stream?lastEventId=${encodeURIComponent(lastEventId)}` : "/api/v1/stream"),
  visible: () => document.visibilityState === "visible",
  onVisibility: (listener) => {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

/**
 * Keeps the live connection open (`connectLive`) while the app is on screen, so every screen
 * updates live. `onEvent` also sees each event.
 */
export function useEventStream(onEvent?: StreamListener) {
  const qc = useQueryClient();
  const listener = useRef(onEvent);
  useEffect(() => {
    listener.current = onEvent;
  }, [onEvent]);

  useEffect(() => connectLive(qc, inBrowser, (event) => listener.current?.(event)), [qc]);
}
