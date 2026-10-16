"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { useAutomation, useAutomationRuns, useDeleteAutomation, useMe, usePrReviews, useRunAutomationNow, useUpdateAutomation } from "@/lib/api/hooks";
import { editorFrom } from "@/lib/automation-editor";
import { automationFlow, hasSteps } from "@/lib/automation-flow";
import { runSummary, runTrail } from "@/lib/automation-steps";
import { describeAutomationStatus } from "@/lib/automations";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { PRICING_PATH } from "@/lib/pricing";
import { AUTOMATION_KIND_LABEL, cn, PR_REVIEW_LABEL } from "@/lib/format";
import { repoName } from "@/lib/pr-review";
import { BrandIcon } from "../brand-icon";
import { ConfirmButton } from "../confirm-button";
import { ChatIcon, ClockIcon, PencilIcon } from "../icons";
import { PageBody, READING } from "../page";
import { toast, toastError } from "../toast";
import { Button, ButtonLink, EmptyState, ErrorState, Pill, Switch } from "../ui";
import { AutomationEditor } from "./automation-editor";
import { FlowView } from "./flow-view";
import { KIND_TINT, KindIcon } from "./kind-icon";

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
      <span aria-hidden className={cn("grid size-11 shrink-0 place-items-center rounded-[13px]", app ? "bg-surface" : KIND_TINT[automation.kind])}>
        {app ? <BrandIcon name={app} size={22} /> : <KindIcon kind={automation.kind} size={22} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-[19px] leading-tight font-semibold tracking-[-0.015em] break-words">{title}</h2>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          {kindLabel}
          {status}
        </span>
      </div>
      {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
    </div>
  );
}

const ACTION = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-nav transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50";

/** A one-time reminder that has run: it is finished, and can't be changed or run again. */
export function isFinished(automation: Pick<Automation, "kind" | "lastRunAt" | "nextRunAt">): boolean {
  return automation.kind === "once" && Boolean(automation.lastRunAt) && !automation.nextRunAt;
}

/**
 * "Run once now": a test run of the saved automation, on or paused, at a normal run's cost. The
 * answer arrives in the Automations chat. One key per click, so a double click is one run.
 */
export function RunOnceButton({ automation }: { automation: Pick<Automation, "id" | "title"> }) {
  const run = useRunAutomationNow();
  const busy = useRef(false);
  return (
    <button
      type="button"
      className={ACTION}
      disabled={run.isPending}
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
      <ClockIcon size={15} />
      {run.isPending ? "Starting…" : "Run once now"}
    </button>
  );
}

function Action({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-nav transition-colors hover:bg-surface-2 hover:text-fg"
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
  const status = describeAutomationStatus(automation);
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
  ) : (
    <>
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
            { onError: (error) => toastError(`Couldn’t ${on ? "pause" : "resume"} “${automation.title}”`, error) },
          )
        }
      />
    </>
  );

  return (
    <>
      <AutomationHeading
        automation={automation}
        title={title}
        kindLabel={review ? PR_REVIEW_LABEL : AUTOMATION_KIND_LABEL[automation.kind]}
        status={!on && <Pill tone={status.tone}>{status.label}</Pill>}
        control={control}
      />
      <p className={cn("-mt-2 text-[13.5px] text-muted", READING)}>
        {review
          ? "How Patch reviews this repo, step by step. Turn it on or off on the review screen."
          : start
            ? "Change any box: click it on the canvas, or fill in the form on a phone. Each change is checked as you go; nothing changes until you save."
            : finished
              ? "This reminder has run its one time, so it is finished. It shows how Tex ran it."
              : "This is how Tex runs it, step by step. Edit changes any box; Run once now tries it, on or paused."}
      </p>
      {start ? (
        <AutomationEditor
          target={{ kind: "change", automation }}
          start={start}
          accountZone={zone}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="-mt-3 flex flex-wrap items-center gap-x-1 gap-y-1">
            {!review && !finished && (
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
              className="ml-1"
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
          <FlowView steps={steps} kind={automation.kind} label={`${title}, step by step`} trail={trail} summary={lastRun ? runSummary(lastRun) : null} />
        </>
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
