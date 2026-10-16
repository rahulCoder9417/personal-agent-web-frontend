"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { useAutomation, useAutomationRuns, useDeleteAutomation, useMe, usePrReviews, useUpdateAutomation } from "@/lib/api/hooks";
import { editorFrom } from "@/lib/automation-editor";
import { automationFlow, hasSteps } from "@/lib/automation-flow";
import { runSummary, runTrail } from "@/lib/automation-steps";
import { describeAutomationTimes } from "@/lib/automations";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { AUTOMATION_KIND_LABEL, cn, PR_REVIEW_LABEL } from "@/lib/format";
import { repoName } from "@/lib/pr-review";
import { ConfirmButton } from "../confirm-button";
import { ChatIcon, PencilIcon } from "../icons";
import { PageBody, READING } from "../page";
import { toast, toastError } from "../toast";
import { Button, ButtonLink, EmptyState, ErrorState, Switch } from "../ui";
import { AutomationEditor } from "./automation-editor";
import { AppsNotice, automationState, isFinished, PausedNotice, StatusPill, useAutomationApps } from "./automation-status";
import { FlowView } from "./flow-view";
import { KindBadge } from "./kind-icon";
import { ACTION, RunOnceButton } from "./run-once";

export { isFinished } from "./automation-status";
export { RunOnceButton } from "./run-once";

/** "← All automations": the way back from an automation's page. */
export function BackToAutomations() {
  return (
    <Link href="/automations" className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-nav transition-colors hover:text-fg">
      <span aria-hidden>←</span> All automations
    </Link>
  );
}

/** The automation's mark, name, kind and state, as the top of its page. `control` sits on the right. */
export function AutomationHeading({
  automation,
  title,
  kindLabel,
  status,
  control,
}: {
  automation: Pick<Automation, "kind" | "trigger" | "preset">;
  title: string;
  kindLabel: string;
  status: ReactNode;
  control?: ReactNode;
}) {
  const app = automation.kind === "event" ? (automation.preset === "pr_review" ? "github" : automation.trigger?.app) : undefined;
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <KindBadge kind={automation.kind} app={app} size={46} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 className="text-[20px] leading-tight font-semibold tracking-[-0.015em] break-words">{title}</h2>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          {status}
          {kindLabel}
        </span>
      </div>
      {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
    </div>
  );
}

function Action({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={ACTION}
    >
      {icon}
      {children}
    </Link>
  );
}

/** The page body while the automation loads: the heading's shape and the canvas's place. */
function Loading() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="size-11 animate-pulse rounded-[13px] bg-surface-2" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
          <span className="h-3 w-1/5 animate-pulse rounded bg-surface-2" />
        </span>
      </div>
      <span className="h-[260px] animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}

/** An address that leads to no automation of this account: deleted, mistyped, or someone else's. */
export function AutomationNotFound() {
  return (
    <EmptyState
      mood="paused"
      title="This automation isn’t here"
      action={
        <ButtonLink href="/automations" variant="primary">
          All automations
        </ButtonLink>
      }
    >
      It may have been deleted, or the link belongs to another account.
    </EmptyState>
  );
}

/** One of the short facts under the heading: the next run, the last, where the results go. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[13px] font-medium break-words text-fg tabular-nums">{children}</dd>
    </div>
  );
}

/** One saved automation: its heading and controls, a line on what the page is, and its flow. */
function Saved({ automation, editing: editingAtFirst = false }: { automation: Automation; editing?: boolean }) {
  const router = useRouter();
  const me = useMe();
  const update = useUpdateAutomation();
  const remove = useDeleteAutomation();
  const review = automation.preset === "pr_review";
  const reviewRepo = usePrReviews().data?.find((item) => item.id === automation.id);
  const title = review && reviewRepo ? repoName(reviewRepo) : automation.title;
  const steps = useMemo(() => automationFlow(automation, me.data?.timezone), [automation, me.data?.timezone]);
  // An automation with steps: its last run's trail on the boxes (kept fresh by the live stream).
  const runs = useAutomationRuns(automation.id, { enabled: hasSteps(automation) });
  const lastRun = hasSteps(automation) ? runs.data?.[0] : undefined;
  const trail = useMemo(() => runTrail(lastRun), [lastRun]);
  const state = automationState(automation);
  const times = describeAutomationTimes(automation);
  const { health, broken } = useAutomationApps(automation);
  const on = automation.enabled;
  const [editing, setEditing] = useState(editingAtFirst);
  const finished = isFinished(automation);
  const zone = me.data?.timezone ?? "UTC";
  const canEdit = !review && !finished;
  const start = useMemo(() => (editing && canEdit ? editorFrom(automation, zone) : null), [editing, canEdit, automation, zone]);

  const control = review ? (
    <ButtonLink href="/automations/reviews" size="sm" aria-label={`Manage review for ${title}`}>
      Manage
    </ButtonLink>
  ) : finished ? null : (
    <label className="flex items-center gap-2.5 rounded-full border border-line bg-surface py-1 pr-1 pl-3">
      <span aria-hidden className={cn("text-[12.5px] font-medium", on ? "text-success" : "text-muted")}>
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
              onSuccess: (saved) => toast({ title: saved.enabled ? `“${saved.title}” is on again` : `Paused “${saved.title}”`, body: saved.enabled ? undefined : "It won’t run until you turn it back on." }),
              onError: (error) => toastError(`Couldn’t ${on ? "pause" : "resume"} “${automation.title}”`, error),
            },
          )
        }
      />
    </label>
  );

  return (
    <>
      <section aria-label="About this automation" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <AutomationHeading
          automation={automation}
          title={title}
          kindLabel={review ? PR_REVIEW_LABEL : AUTOMATION_KIND_LABEL[automation.kind]}
          status={<StatusPill state={state} />}
          control={control}
        />
        <p className={cn("text-[13.5px] text-muted", READING)}>
          {review
            ? "How Patch reviews this repo, step by step. Turn it on or off on the review screen."
            : start
              ? "Change any box: click it on the canvas, or fill in the form on a phone. Each change is checked as you go; nothing changes until you save."
              : finished
                ? "This reminder has run its one time, so it is finished. It shows how Tex ran it."
                : "This is how Tex runs it, step by step. Edit changes any box; Run once now tries it, on or paused."}
        </p>
        {!start && (
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-x-6 gap-y-3 border-t border-line pt-4">
            <Fact label="Next run">{times.next}</Fact>
            <Fact label="Last run">{times.last}</Fact>
            <Fact label="Answers go to">{automation.copyTo ? "Automations chat, and a copy to Telegram" : "Your Automations chat"}</Fact>
          </dl>
        )}
        {!start && (
          <div className="-mx-1 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-line pt-3">
            {canEdit && (
              <>
                <Button variant="primary" size="sm" className="mr-1" onClick={() => setEditing(true)}>
                  <PencilIcon size={14} />
                  Edit
                </Button>
                <RunOnceButton automation={automation} />
              </>
            )}
            <Action href={AUTOMATIONS_CHAT_HREF} icon={<ChatIcon size={15} />}>
              {review ? "See verdicts" : "See runs"}
            </Action>
            {!review && (
              <ConfirmButton
                className="ml-auto"
                label="Delete"
                confirmLabel="Delete for good"
                ariaLabel={`Delete ${automation.title}`}
                pending={remove.isPending}
                onConfirm={() =>
                  remove.mutate(automation.id, {
                    onSuccess: () => {
                      toast({ title: `Deleted “${automation.title}”` });
                      router.push("/automations");
                    },
                    onError: (error) => toastError(`Couldn’t delete “${automation.title}”`, error),
                  })
                }
              />
            )}
          </div>
        )}
      </section>

      {(!on || broken.length > 0) && !start && (
        <div className="-mt-2 flex flex-col gap-2">
          <PausedNotice automation={automation} />
          <AppsNotice broken={broken} />
        </div>
      )}

      {start ? (
        <AutomationEditor
          target={{ kind: "change", automation }}
          start={start}
          accountZone={zone}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <FlowView steps={steps} kind={automation.kind} health={health} label={`${title}, step by step`} trail={trail} summary={lastRun ? runSummary(lastRun) : null} />
      )}
    </>
  );
}

/** An automation's own page, by its id: loading, not found, failed, or the automation. */
export function AutomationScreen({ automationId, editing = false }: { automationId: string; editing?: boolean }) {
  const automation = useAutomation(automationId);
  const missing = automation.error instanceof ApiError && automation.error.status === 404;
  return (
    <PageBody className="gap-6">
      <BackToAutomations />
      {automation.data ? (
        <Saved automation={automation.data} editing={editing} />
      ) : missing ? (
        <AutomationNotFound />
      ) : automation.isError ? (
        <ErrorState error={automation.error} onRetry={() => void automation.refetch()} />
      ) : (
        <Loading />
      )}
    </PageBody>
  );
}
