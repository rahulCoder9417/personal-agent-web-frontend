"use client";

import Link from "next/link";
import { useState } from "react";
import type { Automation } from "@/lib/api/client";
import { useDeleteAutomation, useUpdateAutomation } from "@/lib/api/hooks";
import {
  AUTOMATION_KIND_LABEL,
  cn,
  describeAutomationNext,
  describeAutomationSchedule,
  formatAgo,
  titleCase,
} from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { ClockIcon, TrashIcon, WarningIcon } from "../icons";
import { Button, IconButton, IconTile, InlineError, Switch } from "../ui";

/** Why a paused automation is paused, with the way out. Nothing for one the user paused themselves. */
function PausedNote({ automation }: { automation: Automation }) {
  if (automation.enabled) return null;
  if (automation.pausedReason === "failures") {
    const app = automation.trigger?.app;
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-danger">
        <WarningIcon size={14} className="shrink-0" />
        <span>Paused after it failed a few times.</span>
        <Link href="/apps" className="font-medium text-accent hover:text-accent-dark">
          {app ? `Check ${titleCase(app)} in Apps` : "Check your apps"}
        </Link>
      </p>
    );
  }
  if (automation.pausedReason === "out_of_credits") {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-danger">
        <WarningIcon size={14} className="shrink-0" />
        <span>Paused because you ran out of credits.</span>
        <Link href="/settings/credits" className="font-medium text-accent hover:text-accent-dark">
          Add credits
        </Link>
      </p>
    );
  }
  return null;
}

/** "5 min ago", "yesterday", "12 Sep": formatAgo, but fit for the middle of a sentence. */
function lastRan(iso: string): string {
  const ago = formatAgo(iso);
  return ago === "Yesterday" ? "yesterday" : ago;
}

/** One automation: what it does, when it runs, and the switch and delete that the app is allowed to do. */
export function AutomationRow({ automation }: { automation: Automation }) {
  const update = useUpdateAutomation();
  const remove = useDeleteAutomation();
  const [confirming, setConfirming] = useState(false);
  const on = automation.enabled;
  const triggerApp = automation.kind === "event" ? automation.trigger?.app : undefined;

  return (
    <li className="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0">
      {/* Wide: one row of columns. Narrow: title and switch on top, the schedule on lines below. */}
      <div className="flex items-center gap-x-4 gap-y-1.5 max-lg:flex-wrap">
        <IconTile size={38}>
          {triggerApp ? <BrandIcon name={triggerApp} size={18} /> : <ClockIcon size={18} className="text-nav" />}
        </IconTile>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate text-[14px] font-semibold", !on && "text-muted")}>{automation.title}</span>
          <span className="truncate text-[13px] text-muted">{automation.instruction}</span>
          <PausedNote automation={automation} />
        </div>

        <div className="flex w-[210px] shrink-0 flex-col items-start gap-1 max-lg:order-4 max-lg:w-full max-lg:flex-row max-lg:items-center max-lg:gap-2 max-lg:pl-[54px]">
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-nav">
            {AUTOMATION_KIND_LABEL[automation.kind]}
          </span>
          <span className="max-w-full truncate text-[12px] text-nav">{describeAutomationSchedule(automation)}</span>
        </div>

        <div className="flex w-[170px] shrink-0 flex-col gap-0.5 max-lg:order-5 max-lg:w-full max-lg:flex-row max-lg:gap-2 max-lg:pl-[54px]">
          <span className={cn("truncate text-[12px]", on ? "text-fg" : "text-muted")}>{describeAutomationNext(automation)}</span>
          <span className="truncate text-[12px] text-muted">
            {automation.lastRunAt ? `last ran ${lastRan(automation.lastRunAt)}` : "hasn’t run yet"}
          </span>
        </div>

        <div className="flex w-[156px] shrink-0 items-center justify-end gap-2 max-lg:w-auto">
          {confirming ? (
            <>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="border-danger/40 text-danger hover:border-danger"
                pending={remove.isPending}
                aria-label={`Delete ${automation.title} for good`}
                onClick={() => remove.mutate(automation.id)}
              >
                Delete
              </Button>
            </>
          ) : (
            <>
              <Switch
                on={on}
                label={`${on ? "Pause" : "Resume"} ${automation.title}`}
                disabled={update.isPending}
                onToggle={() => update.mutate({ automationId: automation.id, enabled: !on })}
              />
              <IconButton label={`Delete ${automation.title}`} onClick={() => setConfirming(true)}>
                <TrashIcon size={16} />
              </IconButton>
            </>
          )}
        </div>
      </div>
      <InlineError error={update.error ?? remove.error} className="pl-[54px]" />
    </li>
  );
}
