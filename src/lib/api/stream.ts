"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { addProgress, progressLine, type ProgressLine } from "../crew";
import type { AgentProgress, AgentStatus, Approval, CreditBalance, Message, StreamEvent } from "./client";
import { invalidateAutomations, qk, upsertMessage } from "./hooks";

const EVENT_TYPES: StreamEvent["type"][] = [
  "message.created",
  "message.status",
  "approval.created",
  "approval.resolved",
  "agent.status",
  "agent.progress",
  "credits.updated",
  "automation.updated",
];

export type StreamListener = (event: StreamEvent) => void;

/**
 * After the stream comes back (the hosting cuts it at the function's time limit, every five
 * minutes on Vercel, and a phone drops it when it sleeps): catch up on what the events keep fresh.
 * The backend's stream has no event ids and replays nothing, so whatever was sent while it was
 * down is lost, and the lists have to be asked for again. In a tab nobody is looking at they are
 * only marked stale, and asked for when the tab is shown again (`refetchOnWindowFocus`).
 */
export function catchUpAfterReconnect(qc: QueryClient, visible: boolean) {
  const refetchType = visible ? "active" : "none";
  void qc.invalidateQueries({ queryKey: ["messages"], refetchType });
  void qc.invalidateQueries({ queryKey: ["approvals"], refetchType });
  void qc.invalidateQueries({ queryKey: qk.agentStatus, refetchType });
  // Progress is live only, so what was on screen may belong to a turn that has since ended.
  qc.setQueryData<ProgressLine[]>(qk.agentProgress, []);
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
      switch (event.type) {
        case "message.created":
        case "message.status":
          upsertMessage(qc, event.data as Message);
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
            // The turn is over: its progress lines have nothing more to say.
            qc.setQueryData<ProgressLine[]>(qk.agentProgress, []);
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
      listener.current?.(event);
    };

    source.addEventListener("ready", onReady);
    for (const type of EVENT_TYPES) source.addEventListener(type, onMessage as EventListener);
    return () => source.close();
  }, [qc]);
}
