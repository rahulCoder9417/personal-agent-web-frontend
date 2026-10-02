"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { AgentStatus, Approval, CreditBalance, Message, StreamEvent } from "./client";
import { qk, upsertMessage } from "./hooks";

const EVENT_TYPES: StreamEvent["type"][] = [
  "message.created",
  "message.status",
  "approval.created",
  "approval.resolved",
  "agent.status",
  "credits.updated",
  "automation.updated",
];

export type StreamListener = (event: StreamEvent) => void;

/**
 * Keeps one Server-Sent Events connection open and folds each event into the query cache,
 * so every screen updates live. `onEvent` also sees each event.
 * EventSource reconnects on its own; on every (re)connect the lists are refetched to catch up.
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
      if (opened) {
        // A reconnect: anything sent while we were away is missing.
        void qc.invalidateQueries({ queryKey: ["messages"] });
        void qc.invalidateQueries({ queryKey: ["approvals"] });
        void qc.invalidateQueries({ queryKey: qk.agentStatus });
      }
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
        case "agent.status":
          qc.setQueryData(qk.agentStatus, event.data as AgentStatus);
          break;
        case "credits.updated":
          qc.setQueryData(qk.credits, event.data as CreditBalance);
          void qc.invalidateQueries({ queryKey: qk.me });
          void qc.invalidateQueries({ queryKey: qk.ledger });
          break;
        case "automation.updated":
          void qc.invalidateQueries({ queryKey: qk.automations });
          break;
      }
      listener.current?.(event);
    };

    source.addEventListener("ready", onReady);
    for (const type of EVENT_TYPES) source.addEventListener(type, onMessage as EventListener);
    return () => source.close();
  }, [qc]);
}
