"use client";

import { useRef } from "react";
import type { Automation } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { useRunAutomationNow } from "@/lib/api/hooks";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { cn } from "@/lib/format";
import { PRICING_PATH } from "@/lib/pricing";
import { PlayIcon } from "../icons";
import { toast, toastError } from "../toast";
import { Spinner } from "../ui";

/** The quiet button of an automation's actions (Run once now, See runs, Edit). */
export const ACTION =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-nav transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50";

/**
 * "Run once now": a test run of the saved automation, on or paused, at a normal run's cost. The
 * answer arrives in the Automations chat; the toast says so. One key per click, so a double click is
 * one run. `compact` is the card's smaller button.
 */
export function RunOnceButton({ automation, compact = false, className }: { automation: Pick<Automation, "id" | "title">; compact?: boolean; className?: string }) {
  const run = useRunAutomationNow();
  const busy = useRef(false);
  return (
    <button
      type="button"
      className={cn(ACTION, compact && "h-7 px-2 text-[12.5px]", className)}
      disabled={run.isPending}
      aria-label={`Run “${automation.title}” once now`}
      onClick={() => {
        if (busy.current) return;
        busy.current = true;
        run.mutate(
          { automationId: automation.id, clientRequestId: crypto.randomUUID() },
          {
            onSettled: () => (busy.current = false),
            onSuccess: () =>
              toast({
                title: "Test run started: the answer arrives in your Automations chat",
                body: "It runs once now, as a real run would, and costs what a run costs. The schedule doesn’t move.",
                action: { label: "Open the chat", href: AUTOMATIONS_CHAT_HREF },
              }),
            onError: (error) => {
              if (error instanceof ApiError && error.status === 429)
                toastError("No more test runs for now", "You can run 10 tests an hour. Try again a little later.");
              else if (error instanceof ApiError && error.outOfCredits)
                toastError("Out of credits", "A test run costs what a run costs. Top up or upgrade, then try again.", { label: "See plans", href: PRICING_PATH });
              else toastError(`Couldn’t run “${automation.title}”`, error);
            },
          },
        );
      }}
    >
      {run.isPending ? <Spinner size={compact ? 12 : 14} /> : <PlayIcon size={compact ? 13 : 14} />}
      {run.isPending ? "Starting…" : "Run once now"}
    </button>
  );
}
