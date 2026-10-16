"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { useDeleteAutomation, usePrReviews, useUpdateAutomation } from "@/lib/api/hooks";
import { automationFlow, automationHref } from "@/lib/automation-flow";
import { changeRequest, describeAutomationStatus, describeAutomationTimes, describeAutomationWhen } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { AUTOMATION_KIND_LABEL, cn, PR_REVIEW_LABEL, titleCase } from "@/lib/format";
import { repoName } from "@/lib/pr-review";
import { BrandIcon } from "../brand-icon";
import { ConfirmButton } from "../confirm-button";
import { ChatIcon, ClockIcon, PencilIcon, WarningIcon } from "../icons";
import { toastError } from "../toast";
import { ButtonLink, Pill, Switch } from "../ui";
import { FlowStrip } from "./flow-parts";
import { KIND_TINT, KindIcon } from "./kind-icon";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";

/** Why a paused automation is paused, with the way out. Nothing for one the user paused themselves. */
function PausedNote({ automation }: { automation: Automation }) {
  if (automation.enabled) return null;
  let why: string;
  let way: ReactNode;
  if (automation.pausedReason === "failures") {
    const app = automation.trigger?.app;
    why = "It failed a few times in a row, so it was paused. Fix the cause, then turn it back on.";
    way = (
      <Link href={INTEGRATIONS_APPS_PATH} className="font-medium text-accent hover:text-accent-dark">
        {app ? `Check ${titleCase(app)} in Integrations` : "Check your apps"}
      </Link>
    );
  } else if (automation.pausedReason === "out_of_credits") {
    why = "You ran out of credits, so it was paused. It comes back on by itself when credits are added.";
    way = (
      <Link href="/settings/credits" className="font-medium text-accent hover:text-accent-dark">
        Add credits
      </Link>
    );
  } else {
    return null;
  }
  return (
    <div className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      <WarningIcon size={14} className="mt-0.5 shrink-0" />
      <p className="min-w-0">
        {why} {way}
      </p>
    </div>
  );
}

/** A small text link with an icon, for a card's quick actions. */
function Action({ href, icon, label, children }: { href: string; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] font-medium text-nav transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {icon}
      {children}
    </Link>
  );
}

/**
 * One automation as a card: what it is and whether it is on, when it runs, what Tex does each
 * time, the next and the last run, and what can be done with it. `control` sits top right (the
 * switch, or Manage for a review); `actions` along the foot.
 */
function Card({
  automation,
  title,
  kindLabel,
  task,
  timezone,
  control,
  actions,
}: {
  automation: Automation;
  title: string;
  kindLabel: string;
  /** What Tex does each time it runs. */
  task: ReactNode;
  timezone: string | null | undefined;
  control: ReactNode;
  actions: ReactNode;
}) {
  const on = automation.enabled;
  const status = describeAutomationStatus(automation);
  const times = describeAutomationTimes(automation);
  const app = automation.kind === "event" ? automation.trigger?.app : undefined;
  const steps = automationFlow(automation, timezone);

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-surface transition-colors",
        status.tone === "danger" ? "border-danger/30" : "border-line",
      )}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-[11px]",
              app ? "bg-surface-2" : KIND_TINT[automation.kind],
              !on && "opacity-60 grayscale",
            )}
          >
            {app ? <BrandIcon name={app} size={18} /> : <KindIcon kind={automation.kind} size={18} />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* The name opens the automation's own page, where its flow is drawn. */}
            <h3 className={cn("text-[14.5px] leading-snug font-semibold break-words", !on && "text-nav")}>
              <Link href={automationHref(automation.id)} className="rounded-sm transition-colors hover:text-accent-dark hover:underline">
                {title}
              </Link>
            </h3>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
              {kindLabel}
              {!on && <Pill tone={status.tone}>{status.label}</Pill>}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">{control}</div>
        </div>

        {/* When it runs, as a sentence: this is the line people look for. */}
        <p className={cn("flex items-start gap-2 text-[13.5px] font-medium", on ? "text-fg" : "text-muted")}>
          <ClockIcon size={15} className="mt-[3px] shrink-0 text-muted" />
          <span>{describeAutomationWhen(automation, timezone)}</span>
        </p>

        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <span className="text-[11.5px] text-muted">What Tex does</span>
          <p className="line-clamp-3 text-[13px] text-fg-2">{task}</p>
        </div>

        {/* The five steps it runs, small; its page draws them in full. */}
        <Link href={automationHref(automation.id)} aria-label={`See how “${title}” runs, step by step`} className="-mx-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-accent-soft/60">
          <FlowStrip steps={steps} kind={automation.kind} />
        </Link>

        <PausedNote automation={automation} />

        <dl className="mt-auto grid grid-cols-2 gap-3 text-[12.5px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted">Next run</dt>
            <dd className={cn("tabular-nums", on ? "font-medium text-fg" : "text-muted")}>{times.next}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted">Last run</dt>
            <dd className="text-fg-2 tabular-nums">
              {times.last}
              {times.ran && (
                <>
                  {" · "}
                  <Link href={AUTOMATIONS_CHAT_HREF} className="font-medium text-accent hover:text-accent-dark">
                    See result
                  </Link>
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-line px-2.5 py-1.5">{actions}</div>
    </li>
  );
}

/**
 * A repo with pull-request review on. It is an automation, but not one made by asking Tex: it is
 * turned on, paused and turned off on the review screen, so this card shows it and points there.
 */
function ReviewCard({ automation, timezone }: { automation: Automation; timezone: string | null | undefined }) {
  // The automation doesn't carry its repo; the review list does, under the same id.
  const review = usePrReviews().data?.find((item) => item.id === automation.id);
  const title = review ? repoName(review) : automation.title;
  return (
    <Card
      automation={automation}
      title={title}
      kindLabel={PR_REVIEW_LABEL}
      task="Patch reviews each pull request, comments on it and sends you a short verdict. It never merges."
      timezone={timezone}
      control={
        <ButtonLink href="/automations/reviews" size="sm" aria-label={`Manage review for ${title}`}>
          Manage
        </ButtonLink>
      }
      actions={
        <Action href={AUTOMATIONS_CHAT_HREF} icon={<ChatIcon size={14} />} label={`See the verdicts for ${title} in the Automations chat`}>
          See verdicts
        </Action>
      }
    />
  );
}

function PlainCard({ automation, timezone }: { automation: Automation; timezone: string | null | undefined }) {
  const update = useUpdateAutomation();
  const remove = useDeleteAutomation();
  const on = automation.enabled;

  return (
    <Card
      automation={automation}
      title={automation.title}
      kindLabel={AUTOMATION_KIND_LABEL[automation.kind]}
      task={automation.instruction}
      timezone={timezone}
      control={
        <>
          <span aria-hidden className={cn("text-[12px] font-medium max-sm:hidden", on ? "text-success" : "text-muted")}>
            {on ? "On" : "Off"}
          </span>
          <Switch
            on={on}
            label={`${on ? "Pause" : "Resume"} ${automation.title}`}
            disabled={update.isPending || remove.isPending}
            onToggle={() =>
              update.mutate(
                { automationId: automation.id, enabled: !on },
                {
                  onError: (error) => toastError(`Couldn’t ${on ? "pause" : "resume"} “${automation.title}”`, error),
                },
              )
            }
          />
        </>
      }
      actions={
        <>
          <Action href={AUTOMATIONS_CHAT_HREF} icon={<ChatIcon size={14} />} label={`See the runs of ${automation.title} in the Automations chat`}>
            See runs
          </Action>
          <Action href={chatDraftHref(changeRequest(automation))} icon={<PencilIcon size={14} />} label={`Ask Tex to change ${automation.title}`}>
            Change
          </Action>
          <ConfirmButton
            className="ml-auto"
            label="Delete"
            confirmLabel="Delete for good"
            ariaLabel={`Delete ${automation.title}`}
            pending={remove.isPending}
            onConfirm={() => remove.mutate(automation.id, { onError: (error) => toastError(`Couldn’t delete “${automation.title}”`, error) })}
          />
        </>
      }
    />
  );
}

/**
 * One automation: what it does and when, in words, and what the app is allowed to do with it
 * (pause, resume, delete, ask Tex to change it, see its runs). `timezone` is the person's own, so
 * a schedule in it reads "your time".
 */
export function AutomationCard({ automation, timezone }: { automation: Automation; timezone?: string | null }) {
  if (automation.preset === "pr_review") return <ReviewCard automation={automation} timezone={timezone} />;
  return <PlainCard automation={automation} timezone={timezone} />;
}
