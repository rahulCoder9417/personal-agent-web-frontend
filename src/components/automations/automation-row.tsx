"use client";

import Link from "next/link";
import { useState } from "react";
import type { Automation } from "@/lib/api/client";
import { useDeleteAutomation, usePrReviews, useUpdateAutomation } from "@/lib/api/hooks";
import {
  AUTOMATION_KIND_LABEL,
  cn,
  describeAutomationNext,
  describeAutomationSchedule,
  formatAgo,
  PR_REVIEW_LABEL,
  titleCase,
} from "@/lib/format";
import { repoName } from "@/lib/pr-review";
import { BrandIcon } from "../brand-icon";
import { ClockIcon, TrashIcon, WarningIcon } from "../icons";
import { toastError } from "../toast";
import { Button, ButtonLink, IconButton, IconTile, Switch } from "../ui";

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

/**
 * A repo with pull-request review on. It is an automation, but not one made by asking Tex: it is
 * turned on, paused and turned off on the review screen, so this row shows it and points there.
 */
function ReviewAutomationRow({ automation }: { automation: Automation }) {
  const on = automation.enabled;
  // The automation doesn't carry its repo; the review list does, under the same id.
  const review = usePrReviews().data?.find((item) => item.id === automation.id);
  const title = review ? repoName(review) : automation.title;
  return (
    <li className="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex items-center gap-x-4 gap-y-1.5 max-lg:flex-wrap">
        <IconTile size={38}>
          <BrandIcon name="github" size={18} />
        </IconTile>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate text-[14px] font-semibold", !on && "text-muted")}>{title}</span>
          <span className="truncate text-[13px] text-muted">Patch reviews each pull request and sends you a short verdict.</span>
          <PausedNote automation={automation} />
        </div>

        <div className="flex w-[210px] shrink-0 flex-col items-start gap-1 max-lg:order-4 max-lg:w-full max-lg:flex-row max-lg:flex-wrap max-lg:items-center max-lg:gap-x-2 max-lg:pl-[54px]">
          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-accent-dark">{PR_REVIEW_LABEL}</span>
          <span className="max-w-full text-[12px] text-nav">Each new or updated pull request</span>
        </div>

        <div className="flex w-[170px] shrink-0 flex-col gap-0.5 max-lg:order-5 max-lg:w-full max-lg:flex-row max-lg:gap-2 max-lg:pl-[54px]">
          <span className={cn("truncate text-[12px]", on ? "text-fg" : "text-muted")}>{describeAutomationNext(automation)}</span>
          <span className="truncate text-[12px] text-muted">
            {automation.lastRunAt ? `last review ${lastRan(automation.lastRunAt)}` : "no review yet"}
          </span>
        </div>

        <div className="flex w-[156px] shrink-0 items-center justify-end gap-2 max-lg:w-auto">
          <ButtonLink href="/automations/reviews" size="sm" aria-label={`Manage review for ${title}`}>
            Manage
          </ButtonLink>
        </div>
      </div>
    </li>
  );
}

/** One automation: what it does, when it runs, and the switch and delete that the app is allowed to do. */
export function AutomationRow({ automation }: { automation: Automation }) {
  if (automation.preset === "pr_review") return <ReviewAutomationRow automation={automation} />;
  return <PlainAutomationRow automation={automation} />;
}

function PlainAutomationRow({ automation }: { automation: Automation }) {
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
                onClick={() => remove.mutate(automation.id, { onError: (error) => toastError(`Couldn’t delete “${automation.title}”`, error) })}
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
                onToggle={() =>
                  update.mutate(
                    { automationId: automation.id, enabled: !on },
                    { onError: (error) => toastError(`Couldn’t ${on ? "pause" : "resume"} “${automation.title}”`, error) },
                  )
                }
              />
              <IconButton label={`Delete ${automation.title}`} onClick={() => setConfirming(true)}>
                <TrashIcon size={16} />
              </IconButton>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
