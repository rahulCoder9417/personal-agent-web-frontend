"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { useDeleteAutomation, usePrReviews, useUpdateAutomation } from "@/lib/api/hooks";
import { describeAutomationCost, describeAutomationRuns, describeAutomationStatus, describeAutomationWhen } from "@/lib/automations";
import { cn, PR_REVIEW_LABEL, titleCase } from "@/lib/format";
import { repoName } from "@/lib/pr-review";
import { BrandIcon } from "../brand-icon";
import { ConfirmButton } from "../confirm-button";
import { WarningIcon } from "../icons";
import { toastError } from "../toast";
import { ButtonLink, IconTile, Pill, Switch } from "../ui";
import { KindIcon } from "./kind-icon";

/** Why a paused automation is paused, with the way out. Nothing for one the user paused themselves. */
function PausedNote({ automation }: { automation: Automation }) {
  if (automation.enabled) return null;
  if (automation.pausedReason === "failures") {
    const app = automation.trigger?.app;
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-danger">
        <WarningIcon size={14} className="shrink-0" />
        <span>It failed a few times in a row, so it was paused.</span>
        <Link href="/apps" className="font-medium text-accent hover:text-accent-dark">
          {app ? `Check ${titleCase(app)} in Apps` : "Check your apps"}
        </Link>
      </p>
    );
  }
  if (automation.pausedReason === "out_of_credits") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-danger">
        <WarningIcon size={14} className="shrink-0" />
        <span>You ran out of credits, so it was paused.</span>
        <Link href="/settings/credits" className="font-medium text-accent hover:text-accent-dark">
          Add credits
        </Link>
      </p>
    );
  }
  return null;
}

/**
 * One automation in plain words: its name and whether it is on, when it runs, what Tex was asked
 * to do, the next run, the last one and what it costs. `controls` is what can be done with it.
 */
function Item({
  automation,
  title,
  task,
  timezone,
  controls,
  footer,
}: {
  automation: Automation;
  title: string;
  /** What Tex does when it runs. */
  task: ReactNode;
  timezone: string | null | undefined;
  controls: ReactNode;
  footer?: ReactNode;
}) {
  const on = automation.enabled;
  const review = automation.preset === "pr_review";
  const status = describeAutomationStatus(automation);
  const runs = describeAutomationRuns(automation);
  const app = automation.kind === "event" ? automation.trigger?.app : undefined;

  return (
    <li className="flex gap-3.5 border-b border-line px-5 py-4 last:border-b-0 max-sm:gap-3 max-sm:px-4">
      <IconTile size={38} className={on ? undefined : "opacity-60"}>
        {app ? <BrandIcon name={app} size={18} /> : <KindIcon kind={automation.kind} size={18} className="text-nav" />}
      </IconTile>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className={cn("min-w-0 text-[14.5px] leading-snug font-semibold break-words", !on && "text-muted")}>{title}</h3>
              <Pill tone={status.tone}>{status.label}</Pill>
              {review && <Pill tone="waiting">{PR_REVIEW_LABEL}</Pill>}
            </div>
            {/* When it runs, as a sentence: this is the line people look for. */}
            <p className={cn("text-[13.5px]", on ? "text-fg" : "text-muted")}>{describeAutomationWhen(automation, timezone)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">{controls}</div>
        </div>

        <p className="line-clamp-2 text-[13px] text-muted">{task}</p>
        <PausedNote automation={automation} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
          <dl className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-muted">
            <div>
              <dt className="sr-only">Next run</dt>
              <dd className={on ? "text-fg-2" : undefined}>{runs.next}</dd>
            </div>
            <div>
              <dt className="sr-only">Last run</dt>
              <dd>{runs.last}</dd>
            </div>
            <div>
              <dt className="sr-only">Credits</dt>
              <dd>{describeAutomationCost(automation)}</dd>
            </div>
          </dl>
          {footer}
        </div>
      </div>
    </li>
  );
}

/**
 * A repo with pull-request review on. It is an automation, but not one made by asking Tex: it is
 * turned on, paused and turned off on the review screen, so this row shows it and points there.
 */
function ReviewAutomationRow({ automation, timezone }: { automation: Automation; timezone: string | null | undefined }) {
  // The automation doesn't carry its repo; the review list does, under the same id.
  const review = usePrReviews().data?.find((item) => item.id === automation.id);
  const title = review ? repoName(review) : automation.title;
  return (
    <Item
      automation={automation}
      title={title}
      task="Patch reviews each pull request, comments on it and sends you a short verdict. It never merges."
      timezone={timezone}
      controls={
        <ButtonLink href="/automations/reviews" size="sm" aria-label={`Manage review for ${title}`}>
          Manage
        </ButtonLink>
      }
    />
  );
}

function PlainAutomationRow({ automation, timezone }: { automation: Automation; timezone: string | null | undefined }) {
  const update = useUpdateAutomation();
  const remove = useDeleteAutomation();
  const on = automation.enabled;

  return (
    <Item
      automation={automation}
      title={automation.title}
      task={<>Tex was asked: “{automation.instruction}”</>}
      timezone={timezone}
      controls={
        <Switch
          on={on}
          label={`${on ? "Pause" : "Resume"} ${automation.title}`}
          disabled={update.isPending || remove.isPending}
          onToggle={() =>
            update.mutate(
              { automationId: automation.id, enabled: !on },
              { onError: (error) => toastError(`Couldn’t ${on ? "pause" : "resume"} “${automation.title}”`, error) },
            )
          }
        />
      }
      footer={
        <ConfirmButton
          label="Delete"
          confirmLabel="Delete for good"
          ariaLabel={`Delete ${automation.title}`}
          pending={remove.isPending}
          onConfirm={() => remove.mutate(automation.id, { onError: (error) => toastError(`Couldn’t delete “${automation.title}”`, error) })}
        />
      }
    />
  );
}

/**
 * One automation: what it does and when, in words, and what the app is allowed to do with it
 * (pause, resume, delete). `timezone` is the person's own, so a schedule in it reads "your time".
 */
export function AutomationRow({ automation, timezone }: { automation: Automation; timezone?: string | null }) {
  if (automation.preset === "pr_review") return <ReviewAutomationRow automation={automation} timezone={timezone} />;
  return <PlainAutomationRow automation={automation} timezone={timezone} />;
}
