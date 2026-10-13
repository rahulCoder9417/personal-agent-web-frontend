"use client";

import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { addProgress, progressLine, type ProgressLine } from "../crew";
import { draftArrived, DRAFTS_KEY, type Drafts, messageArrived, messageSettled, NO_DRAFTS, turnsOver } from "../drafts";
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
  void qc.invalidateQueries({ queryKey: qk.agentStatus, refetchType });
  // Progress is live only, so what was on screen may belong to a turn that has since ended.
  qc.setQueryData<ProgressLine[]>(qk.agentProgress, []);
  // So is a draft. If the turn still runs, its next draft brings the whole text back.
  updateDrafts(qc, turnsOver);
}

function updateDrafts(qc: QueryClient, change: (drafts: Drafts) => Drafts) {
  qc.setQueryData<Drafts>(DRAFTS_KEY, (drafts) => change(drafts ?? NO_DRAFTS));
}

/**
 * What Tex is writing in a conversation right now (`message.draft` on the live stream), or null.
 * Live only: it is never asked for, and goes when the answer arrives or the turn ends (`src/lib/drafts.ts`).
 */
export function useDraft(conversationId: string | null): MessageDraft | null {
  const drafts = useQuery<Drafts>({ queryKey: DRAFTS_KEY, queryFn: () => NO_DRAFTS, enabled: false, initialData: NO_DRAFTS, staleTime: Infinity }).data;
  return (conversationId && drafts.shown[conversationId]) || null;
}

/** Folds one event from the live stream into the query cache, so every screen shows it. */
export function applyStreamEvent(qc: QueryClient, event: StreamEvent) {
  switch (event.type) {
    case "message.created":
      // The message carries its conversation: it joins that thread, and the conversation moves up.
      addMessage(qc, event.data as Message);
      // Tex's answer takes the place of what was shown of it while it was written.
      updateDrafts(qc, (drafts) => messageArrived(drafts, event.data as Message));
      break;
    case "message.status":
      upsertMessage(qc, event.data as Message);
      updateDrafts(qc, (drafts) => messageSettled(drafts, event.data as Message));
      break;
    case "message.draft":
      // Live only: the whole answer so far, while Tex writes it in a web chat turn.
      updateDrafts(qc, (drafts) => draftArrived(drafts, event.data as MessageDraft));
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
    case "agent.progress":
      // Live only: a short line about what the agent, or one of the crew, is doing right now.
      qc.setQueryData<ProgressLine[]>(qk.agentProgress, (lines) => addProgress(lines ?? [], progressLine(event.data as AgentProgress)));
      break;
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
