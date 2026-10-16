"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { useDeleteAutomation, usePrReviews, useUpdateAutomation } from "@/lib/api/hooks";
import { automationEditHref, automationFlow, automationHref } from "@/lib/automation-flow";
import { describeAutomationTimes } from "@/lib/automations";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { AUTOMATION_KIND_LABEL, cn, PR_REVIEW_LABEL } from "@/lib/format";
import { repoName } from "@/lib/pr-review";
import { ConfirmButton } from "../confirm-button";
import { ChatIcon, ClockIcon, PencilIcon } from "../icons";
import { toastError } from "../toast";
import { ButtonLink, Switch } from "../ui";
import { AppsNotice, automationState, isFinished, PausedNotice, StatusPill, useAutomationApps } from "./automation-status";
import { FlowChain } from "./flow-chain";
import { KindBadge } from "./kind-icon";
import { RunOnceButton } from "./run-once";

/** A small text link with an icon, for a card's quick actions. */
function Action({ href, icon, label, children }: { href: string; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-nav transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {icon}
      {children}
    </Link>
  );
}

/**
 * One automation as a card: its badge, name, kind and state, with the switch (or Manage); its flow
 * as connected boxes (when it runs → what Tex does, with the apps it is connected to → where the
 * results go); what needs the person (paused by the system, an app to reconnect); its last and next
 * run; and the quick actions. `control` sits top right; `actions` along the foot.
 */
function Card({
  automation,
  title,
  kindLabel,
  timezone,
  control,
  actions,
}: {
  automation: Automation;
  title: string;
  kindLabel: string;
  timezone: string | null | undefined;
  control: ReactNode;
  actions: ReactNode;
}) {
  const state = automationState(automation);
  const times = describeAutomationTimes(automation);
  const app = automation.kind === "event" ? (automation.preset === "pr_review" ? "github" : automation.trigger?.app) : undefined;
  const steps = automationFlow(automation, timezone);
  const { health, broken } = useAutomationApps(automation);
  const quiet = state.tone !== "on";
  const needsYou = state.tone === "danger" || broken.length > 0;

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-surface shadow-[0_1px_2px_rgb(21_21_21/0.04)] transition-colors",
        needsYou ? "border-danger/35" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div className="flex items-start gap-3">
          <KindBadge kind={automation.kind} app={app} size={38} dim={quiet} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* The name opens the automation's own page, where its flow is drawn. */}
            <h3 className={cn("text-[14.5px] leading-snug font-semibold break-words", quiet && "text-nav")}>
              <Link href={automationHref(automation.id)} className="rounded-sm transition-colors hover:text-accent-dark hover:underline">
                {title}
              </Link>
            </h3>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
              <StatusPill state={state} />
              {kindLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">{control}</div>
        </div>

        {/* Its flow, as connected boxes; its page draws it in full. */}
        <Link
          href={automationHref(automation.id)}
          aria-label={`See how “${title}” runs, step by step`}
          className="-m-1 rounded-[14px] p-1 transition-colors hover:bg-accent-soft/50 focus-visible:bg-accent-soft/50"
        >
          <FlowChain steps={steps} kind={automation.kind} health={health} dim={quiet} />
        </Link>

        <PausedNotice automation={automation} />
        <AppsNotice broken={broken} />

        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-3 text-[12.5px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1 text-muted">
              <ClockIcon size={12} />
              Next run
            </dt>
            <dd className={cn("tabular-nums", state.tone === "on" ? "font-medium text-fg" : "text-muted")}>{times.next}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1 text-muted">
              <ChatIcon size={12} />
              Last run
            </dt>
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

      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 rounded-b-2xl border-t border-line bg-surface-2/40 px-2 py-1.5">{actions}</div>
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
  const finished = isFinished(automation);

  return (
    <Card
      automation={automation}
      title={automation.title}
      kindLabel={AUTOMATION_KIND_LABEL[automation.kind]}
      timezone={timezone}
      control={
        !finished && (
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
        )
      }
      actions={
        <>
          <Action href={AUTOMATIONS_CHAT_HREF} icon={<ChatIcon size={14} />} label={`See the runs of ${automation.title} in the Automations chat`}>
            See runs
          </Action>
          {!finished && (
            <>
              <Action href={automationEditHref(automation.id)} icon={<PencilIcon size={14} />} label={`Change ${automation.title}`}>
                Change
              </Action>
              <RunOnceButton automation={automation} compact />
            </>
          )}
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
 * One automation: what it does and when, as connected boxes, and what the app is allowed to do with
 * it (pause, resume, delete, change it on its page, try it once, see its runs). `timezone` is the
 * person's own, so a schedule in it reads "your time".
 */
export function AutomationCard({ automation, timezone }: { automation: Automation; timezone?: string | null }) {
  if (automation.preset === "pr_review") return <ReviewCard automation={automation} timezone={timezone} />;
  return <PlainCard automation={automation} timezone={timezone} />;
}
