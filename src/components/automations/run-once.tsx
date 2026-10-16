"use client";

import { useRef } from "react";
import type { Automation } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { useRunAutomationNow } from "@/lib/api/hooks";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { PRICING_PATH } from "@/lib/pricing";
import { PlayIcon } from "../icons";
import { toast, toastError } from "../toast";
import { Btn } from "./parts";

/**
 * "Run once now": a test run of the saved automation, on or paused, at a normal run's cost. The
 * answer arrives in the Automations chat; the toast says so. One key per click, so a double click is
 * one run.
 */
export function useRunOnce() {
  const run = useRunAutomationNow();
  const busy = useRef(false);
  function start(automation: Pick<Automation, "id" | "title">) {
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
          if (error instanceof ApiError && error.status === 429) toastError("No more test runs for now", "You can run 10 tests an hour. Try again a little later.");
          else if (error instanceof ApiError && error.outOfCredits)
            toastError("Out of credits", "A test run costs what a run costs. Top up or upgrade, then try again.", { label: "See plans", href: PRICING_PATH });
          else toastError(`Couldn’t run “${automation.title}”`, error);
        },
      },
    );
  }
  return { start, pending: run.isPending };
}

/**
 * The canvas's "Test run": runs the saved automation once now. With changes not saved yet, it runs
 * the saved version, and says so.
 */
export function RunOnceButton({ automation, unsaved = false }: { automation: Pick<Automation, "id" | "title">; unsaved?: boolean }) {
  const { start, pending } = useRunOnce();
  return (
    <Btn
      pending={pending}
      aria-label={`Run “${automation.title}” once now`}
      title={unsaved ? "Runs the saved version once now. Save first to try your changes." : "Runs it once now, as a real run would."}
      onClick={() => start(automation)}
    >
      {!pending && <PlayIcon size={14} />}
      Test run
    </Btn>
  );
}
