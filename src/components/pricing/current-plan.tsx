"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CheckIcon } from "@/components/icons";
import { nextToExpire } from "@/components/settings/credits-balance";
import { toast, toastError } from "@/components/toast";
import { Button, Card, ErrorState, Pill, SectionLabel } from "@/components/ui";
import { ApiError, errorMessage, type Plan, type Subscription, type TopUpPack } from "@/lib/api/client";
import { useCancelSubscription, useCredits } from "@/lib/api/hooks";
import { cn, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { canCancel, cancelCopy, describeSubscription, nextMonthlyCredits, planFeatures, planInterval, STATUS } from "./pricing-logic";

function cancelError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "There’s no active paid subscription to cancel.";
  return errorMessage(error);
}

/**
 * Before a plan is cancelled: until when it stays, that it won't renew, where the account lands.
 * `POST /v1/billing/subscription/cancel` asks Polar to stop it at the end of the period; a toast
 * says how it went, and the card then says when it ends.
 */
function CancelDialog({ plan, subscription, free, onClose }: { plan: Plan | undefined; subscription: Subscription; free: Plan | undefined; onClose: () => void }) {
  const cancel = useCancelSubscription();
  const copy = cancelCopy(plan, subscription, free);
  return (
    <ConfirmDialog
      title={copy.title}
      confirmLabel={copy.confirmLabel}
      cancelLabel={copy.cancelLabel}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await cancel.mutateAsync();
          toast(copy.done);
        } catch (error) {
          toastError(`Couldn’t cancel ${plan?.name ?? "your plan"}`, cancelError(error));
        }
      }}
    >
      <p>{copy.keep}</p>
      <p>{copy.after}</p>
    </ConfirmDialog>
  );
}

/** The balance beside the plan: what is left, what expires next, and what the plan adds next. */
function CreditsLeft({ subscription, plan }: { subscription: Subscription; plan: Plan | undefined }) {
  const credits = useCredits();
  const next = credits.data ? nextToExpire(credits.data.grants) : undefined;
  const coming = nextMonthlyCredits(subscription, plan);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SectionLabel as="h3">Credits left</SectionLabel>
      {credits.isPending ? (
        <div aria-hidden className="h-[72px] animate-pulse rounded-xl bg-surface-2" />
      ) : credits.isError ? (
        <ErrorState error={credits.error} onRetry={() => void credits.refetch()} className="border-0 py-4" />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-[34px] leading-none font-semibold tracking-[-0.04em] tabular-nums", credits.data.balance <= 0 && "text-danger")}>
              {formatNumber(credits.data.balance)}
            </span>
            <span className="text-[14px] text-muted">credits</span>
          </div>
          <ul className="flex flex-col gap-1 text-[13px] text-muted">
            {credits.data.balance <= 0 && <li className="font-medium text-fg">Tex is paused until you add credits.</li>}
            <li>
              {next?.expiresAt
                ? `${formatNumber(next.remaining)} expire on ${formatDate(next.expiresAt)}. The ones that expire soonest are used first.`
                : "None of them expire soon."}
            </li>
            {coming && <li>{coming}</li>}
          </ul>
        </>
      )}
      <Link href="/settings/credits" className="self-start text-[13px] font-medium text-accent hover:text-accent-dark">
        See your credit history
      </Link>
    </div>
  );
}

/**
 * Pricing → Your plan: the plan with its price and what happens next (renews, ends, payment
 * failed), the credits left, what the plan includes, and Cancel behind a confirm dialog. Once
 * cancelled it says when it ends: the API can't undo a cancel, so there is no "keep my plan" here.
 */
export function CurrentPlan({
  subscription,
  plan,
  free,
  topUp,
}: {
  subscription: Subscription;
  plan: Plan | undefined;
  /** The Free plan, to say what the account keeps after cancelling. */
  free: Plan | undefined;
  topUp: TopUpPack | undefined;
}) {
  const [asking, setAsking] = useState(false);
  const status = STATUS[subscription.status];
  const features = plan ? planFeatures(plan, topUp) : [];

  return (
    <Card role="group" aria-label="Your plan" className="@container flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-6 py-5 max-sm:px-5">
        <div className="flex min-w-0 flex-1 basis-[280px] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">{plan?.name ?? subscription.plan}</span>
            {status && <Pill tone={status.tone}>{status.label}</Pill>}
          </div>
          <p className="text-[13.5px] text-muted">{describeSubscription(subscription, plan)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {plan && (
            <div className="flex items-baseline gap-2">
              <span className="text-[30px] leading-none font-semibold tracking-[-0.04em]">{formatMoney(plan.priceCents)}</span>
              <span className="text-[13px] text-muted">{planInterval(plan)}</span>
            </div>
          )}
          {canCancel(subscription) && (
            <Button variant="danger-outline" onClick={() => setAsking(true)} disabled={asking}>
              Cancel plan
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 border-t border-line @min-[680px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="px-6 py-5 max-sm:px-5 @min-[680px]:border-r @min-[680px]:border-line">
          <CreditsLeft subscription={subscription} plan={plan} />
        </div>
        <div className="flex flex-col gap-2.5 border-t border-line px-6 py-5 max-sm:px-5 @min-[680px]:border-t-0">
          <SectionLabel as="h3">What it includes</SectionLabel>
          {features.length > 0 ? (
            // Down each column first, as many columns as fit, so the list reads in its own order.
            <ul className="gap-x-6 text-[13.5px]" style={{ columnWidth: 230 }}>
              {features.map((feature) => (
                <li key={feature} className="flex break-inside-avoid gap-2.5 pb-2">
                  <CheckIcon size={16} className="mt-[2px] shrink-0 text-accent" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted">See the plans below.</p>
          )}
        </div>
      </div>

      {asking && <CancelDialog plan={plan} subscription={subscription} free={free} onClose={() => setAsking(false)} />}
    </Card>
  );
}
