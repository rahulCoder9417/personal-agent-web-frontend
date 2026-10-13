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
import type { AgentProgress, AgentStatus, Approval, Conversation, CreditBalance, Message, MessageDraft, StreamEvent } from "./client";
import { addMessage, invalidateAutomations, qk, removeConversation, upsertConversation, upsertMessage } from "./hooks";

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
  "conversation.updated",
  "conversation.deleted",
];

export type StreamListener = (event: StreamEvent) => void;

/**
 * After the stream comes back (the hosting cuts it at the function's time limit, every five
 * minutes on Vercel, and a phone drops it when it sleeps): catch up on what the events keep fresh.
 * The backend's stream has no event ids and replays nothing, so whatever was sent while it was
 * down is lost, and the lists (the open threads, the chat history, the approvals) have to be asked
 * for again. In a tab nobody is looking at they are
 * only marked stale, and asked for when the tab is shown again (`refetchOnWindowFocus`).
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

/** Folds one event from the live stream into the query cache, so every screen shows it. */
export function applyStreamEvent(qc: QueryClient, event: StreamEvent) {
  switch (event.type) {
    case "message.created":
      // The message carries its conversation: it joins that thread, and the conversation moves up.
      addMessage(qc, event.data as Message);
      // Tex's answer takes the place of what was shown of it while it was written, and the steps fold into it.
      updateDrafts(qc, (drafts) => messageArrived(drafts, event.data as Message));
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
  }
}

/**
 * Keeps one Server-Sent Events connection open and folds each event into the query cache,
 * so every screen updates live. `onEvent` also sees each event.
 * EventSource reconnects on its own; each reconnect catches up (`catchUpAfterReconnect`).
 */
export function useEventStream(onEvent?: StreamListener) {
  const qc = useQueryClient();
  const listener = useRef(onEvent);
  useEffect(() => {
    listener.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const source = new EventSource("/api/v1/stream");
    let opened = false;

    const onReady = () => {
      // A reconnect: anything sent while we were away is missing. (The first connect needs
      // nothing: the lists are being asked for the first time.)
      if (opened) catchUpAfterReconnect(qc, document.visibilityState === "visible");
      opened = true;
    };

    const onMessage = (raw: MessageEvent<string>) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(raw.data) as StreamEvent;
      } catch {
        return;
      }
      applyStreamEvent(qc, event);
      listener.current?.(event);
    };

    source.addEventListener("ready", onReady);
    for (const type of EVENT_TYPES) source.addEventListener(type, onMessage as EventListener);
    return () => source.close();
  }, [qc]);
}
