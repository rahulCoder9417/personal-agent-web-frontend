"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { AppIcon } from "@/components/brand-icon";
import { ConfirmButton } from "@/components/confirm-button";
import { WarningIcon } from "@/components/icons";
import { toastError } from "@/components/toast";
import { Button, ButtonLink, Card, Field, inputClass, Meta, Pill, Switch } from "@/components/ui";
import { refusedTypedValue } from "@/lib/action-errors";
import type { PrReviewRepo } from "@/lib/api/client";
import { useApps, useDisablePrReview, useEnablePrReview, useMe, usePlans, useUpdateAutomation } from "@/lib/api/hooks";
import { cn, formatAgo, formatDate } from "@/lib/format";
import {
  describeDisableError,
  describeEnableError,
  describeReviewState,
  parseRepo,
  repoName,
  verdictPlace,
  type PlanContext,
  type ReviewError,
} from "@/lib/pr-review";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";

/** "5 min ago", "yesterday", "12 Sep": formatAgo, but fit for the middle of a sentence. */
function ago(iso: string): string {
  const text = formatAgo(iso);
  return text === "Yesterday" ? "yesterday" : text;
}

/** One repo with review on: its state, where the verdict goes, when Patch last reviewed, and the two controls. */
export function ReviewRepoRow({ review }: { review: PrReviewRepo }) {
  const update = useUpdateAutomation();
  const remove = useDisablePrReview();
  const name = repoName(review);
  // Show the switch where it's heading while the request is in flight.
  const enabled = update.isPending ? Boolean(update.variables?.enabled) : review.enabled;
  const state = describeReviewState({ enabled, pausedReason: enabled ? null : update.isPending ? "user" : review.pausedReason });

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <AppIcon name="github" size={38} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("truncate text-[14.5px] font-semibold", !enabled && "text-muted")}>{name}</span>
            <Pill tone={state.tone}>{state.label}</Pill>
          </div>
          <Meta>
            Verdict goes to {verdictPlace(review.channel)} · {review.lastReviewAt ? `last review ${ago(review.lastReviewAt)}` : "no review yet"}
          </Meta>
        </div>
        <Switch
          on={enabled}
          disabled={update.isPending || remove.isPending}
          label={`${enabled ? "Pause" : "Resume"} review for ${name}`}
          // A repo is paused and resumed as the automation it is.
          onToggle={() =>
            update.mutate(
              { automationId: review.id, enabled: !enabled },
              { onError: (error) => toastError(`Couldn’t ${enabled ? "pause" : "resume"} review for ${name}`, error) },
            )
          }
        />
      </div>

      {state.why && (
        <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]", state.tone === "danger" ? "text-danger" : "text-muted")}>
          {state.tone === "danger" && <WarningIcon size={14} className="shrink-0" />}
          <span>{state.why}</span>
          {state.fix && (
            <Link href={state.fix.href} className="font-medium text-accent hover:text-accent-dark">
              {state.fix.label}
            </Link>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-surface-2 pt-2.5">
        <Meta className="text-[12px]">review on since {formatDate(review.createdAt)}</Meta>
        <ConfirmButton
          label="Turn off"
          confirmLabel="Turn off review"
          ariaLabel={`Turn off review for ${name}`}
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(
              { owner: review.owner, repo: review.repo },
              {
                onError: (error) => {
                  // A repo that was already off is not worth an error (describeDisableError says nothing).
                  const why = describeDisableError(error);
                  if (why) toastError(`Couldn’t turn off review for ${name}`, why);
                },
              },
            )
          }
        />
      </div>
    </Card>
  );
}

/** What the plan allows, so a refusal can say "Your Pro plan allows 5 automations". */
function usePlanContext(): PlanContext {
  const me = useMe();
  const plans = usePlans();
  const plan = plans.data?.plans.find((item) => item.id === me.data?.plan);
  if (!plan) return {};
  return {
    planName: plan.name,
    automations: plan.limits.automations,
    canUpgrade: plans.data?.plans.some((item) => item.limits.automations > plan.limits.automations) ?? false,
  };
}

/** GitHub as the Apps screen knows it: connected and working, expired, or not connected at all. */
function useGitHub(): "loading" | "connected" | "expired" | "missing" {
  const apps = useApps();
  if (!apps.data) return apps.isError ? "connected" : "loading"; // Can't tell: let the API answer.
  const connections = apps.data.find((app) => app.slug === "github")?.connections ?? [];
  if (connections.some((connection) => connection.status === "active")) return "connected";
  return connections.length > 0 ? "expired" : "missing";
}

/** Review can't run without GitHub: say so at the top of the screen, with the way to fix it. */
export function GitHubNotice() {
  const github = useGitHub();
  if (github !== "missing" && github !== "expired") return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 shadow-[0_0_0_1px_var(--line-strong)]">
      <p className="min-w-[220px] flex-1 text-[13.5px]">
        <span className="font-semibold">{github === "expired" ? "GitHub needs reconnecting." : "GitHub isn’t connected."}</span>{" "}
        <span className="text-muted">Patch needs it to see your pull requests and comment on them.</span>
      </p>
      <ButtonLink href={INTEGRATIONS_APPS_PATH} size="sm" variant="primary">
        {github === "expired" ? "Reconnect GitHub" : "Connect GitHub"}
      </ButtonLink>
    </div>
  );
}

function Refusal({ error }: { error: ReviewError }) {
  return (
    <p role="alert" className="flex flex-col items-start gap-1 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      <span>{error.message}</span>
      {error.link && (
        <Link href={error.link.href} className="font-medium underline underline-offset-2">
          {error.link.label}
        </Link>
      )}
    </p>
  );
}

/** Turn review on for one more repo. The repo can be typed as owner/repo or pasted as a GitHub link. */
export function AddReviewRepoForm() {
  const enable = useEnablePrReview();
  const plan = usePlanContext();
  const github = useGitHub();
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  // The repo the last request was for, so its answer names it even after the field has changed.
  const [asked, setAsked] = useState("");
  const id = useId();
  const blocked = github === "missing" || github === "expired";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (enable.isPending || blocked) return;
    const parsed = parseRepo(text);
    if (!parsed.ok) {
      setInvalid(parsed.error);
      return;
    }
    setInvalid(null);
    const name = repoName(parsed.repo);
    setAsked(name);
    enable.mutate(parsed.repo, {
      onSuccess: () => setText(""),
      onError: (error) => {
        // What the API says about the repo as typed stays under the field; the rest is a toast.
        if (refusedTypedValue(error)) return;
        const refusal = describeEnableError(error, name, plan);
        toastError(`Couldn’t turn on review for ${name}`, refusal.message, refusal.link);
      },
    });
  };
  const repoRefused = refusedTypedValue(enable.error) ? describeEnableError(enable.error, asked, plan) : null;

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="text-[15px] font-semibold">
          Turn on review for a repo
        </h2>

        <Field
          label="Repo"
          htmlFor={`${id}-repo`}
          hint={
            blocked ? (
              <>
                {github === "expired" ? "Reconnect GitHub first, in " : "Connect GitHub first, in "}
                <Link href={INTEGRATIONS_APPS_PATH} className="font-medium text-accent hover:text-accent-dark">
                  Integrations
                </Link>
                .
              </>
            ) : (
              "Like acme/website, or paste the repo’s GitHub link."
            )
          }
          error={invalid}
        >
          <input
            id={`${id}-repo`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setInvalid(null);
              if (enable.isError || enable.isSuccess) enable.reset();
            }}
            placeholder="owner/repo"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={blocked}
            className={cn(inputClass, "font-mono text-[12.5px]")}
          />
        </Field>

        <p className="text-[12.5px] text-muted">
          Turning it on is your OK for Patch to comment on pull requests in this repo. Merging and anything else risky still ask first.
        </p>

        {repoRefused && <Refusal error={repoRefused} />}
        {enable.isSuccess && (
          <p role="status" className="text-[12.5px] font-medium text-success">
            Review is on for {repoName(enable.data)}.
          </p>
        )}

        <Button type="submit" variant="primary" pending={enable.isPending} disabled={blocked || github === "loading"}>
          Turn on review
        </Button>
      </form>
    </Card>
  );
}
