"use client";

import { useState } from "react";
import { ApiError, errorMessage, type Plan, type Subscription } from "@/lib/api/client";
import { useCancelSubscription } from "@/lib/api/hooks";
import { toastError } from "@/components/toast";
import { Button, Card, Pill, SectionLabel, type PillTone } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

const STATUS: Record<Subscription["status"], { label: string; tone: PillTone }> = {
  none: { label: "No subscription", tone: "muted" },
  active: { label: "Active", tone: "done" },
  cancel_at_period_end: { label: "Ending", tone: "waiting" },
  past_due: { label: "Payment failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** The line under the plan name: what happens next, in words. */
function describe(subscription: Subscription, plan: Plan | undefined): string {
  const name = plan?.name ?? "your plan";
  const end = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : null;
  const price = plan && plan.priceCents > 0 ? `${formatMoney(plan.priceCents)} per ${plan.interval ?? "month"}` : null;

  switch (subscription.status) {
    case "active":
      return [end ? `Renews ${end}` : "Renews every month", price].filter(Boolean).join(" · ");
    case "cancel_at_period_end":
      return end ? `Ends ${end}. You keep ${name} until then, then move to Free.` : `You keep ${name} until the end of this period.`;
    case "past_due":
      return `The last payment for ${name} didn’t go through. Polar will try again and has emailed you a link to update your card. You keep ${name} in the meantime.`;
    case "cancelled":
      return end ? `Ended ${end}. You’re on Free now.` : "Your subscription has ended. You’re on Free now.";
    case "none":
      return "You’re on Free. Start a plan below whenever you want more credits.";
  }
}

function cancelError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "There’s no active paid subscription to cancel.";
  return errorMessage(error);
}

/** The current subscription, with cancel-at-period-end behind an inline confirm. */
export function SubscriptionCard({ subscription, plan }: { subscription: Subscription; plan: Plan | undefined }) {
  const cancel = useCancelSubscription();
  const [confirming, setConfirming] = useState(false);
  const status = STATUS[subscription.status];
  const canCancel = subscription.status === "active" && subscription.plan !== "free";
  const end = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "the end of this period";
  const name = plan?.name ?? "your plan";

  return (
    <Card role="group" aria-label="Your subscription" className="flex flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionLabel as="span">Your plan</SectionLabel>
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{plan?.name ?? subscription.plan}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
          <span className="text-[13px] text-muted">{describe(subscription, plan)}</span>
        </div>
        {canCancel && !confirming && (
          <Button onClick={() => setConfirming(true)}>Cancel at period end</Button>
        )}
      </div>

      {canCancel && confirming && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <p className="min-w-[220px] flex-1 text-[13.5px]">
            Cancel {name}? You keep it until {end}, then move to Free. Credits you already have stay until they expire.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setConfirming(false)} disabled={cancel.isPending}>
              Keep {name}
            </Button>
            <Button
              size="sm"
              variant="primary"
              pending={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => setConfirming(false),
                  onError: (error) => toastError(`Couldn’t cancel ${name}`, cancelError(error)),
                })
              }
            >
              Cancel at period end
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
