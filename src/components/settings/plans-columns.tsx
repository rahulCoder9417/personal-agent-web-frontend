"use client";

import { usePendingCheckout } from "@/components/checkout-watcher";
import { CheckIcon } from "@/components/icons";
import { Button, Pill } from "@/components/ui";
import { ApiError, errorMessage, type Plan, type Subscription, type TopUpPack } from "@/lib/api/client";
import { useCreateCheckout } from "@/lib/api/hooks";
import { planAction, startPendingCheckout } from "@/lib/checkout";
import { leaveTo } from "@/lib/navigate";
import { cn, formatDate, formatMoney, formatNumber } from "@/lib/format";

/** What a plan includes, read from its numbers. Used when the API sends no feature list of its own. */
function derivedFeatures(plan: Plan, topUp: TopUpPack | undefined): string[] {
  const lines: string[] = [];
  if (plan.monthlyCredits > 0) lines.push(`${formatNumber(plan.monthlyCredits)} credits every month`);
  if (plan.signupCredits > 0) lines.push(`${formatNumber(plan.signupCredits)} credits at sign-up, plus coupon codes`);
  lines.push(`${formatNumber(plan.limits.apps)} apps${plan.limits.ownMcpServers ? " plus your own MCP servers" : ""}`);
  lines.push(`${formatNumber(plan.limits.automations)} ${plan.limits.automations === 1 ? "automation" : "automations"}`);
  if (plan.limits.browser) lines.push("Browser use: 2 credits per minute");
  if (plan.limits.topUps) {
    lines.push(topUp ? `Top-ups: ${formatMoney(topUp.priceCents)} for ${formatNumber(topUp.credits)} credits` : "Top-ups when you need more");
  }
  return lines;
}

function checkoutError(error: unknown): string {
  if (error instanceof ApiError && (error.planLimit || error.status === 403)) return "That plan isn’t available for your account.";
  // A 400 carries the backend's own reason ("Cancel your current plan first…").
  return errorMessage(error);
}

function PlanColumn({
  plan,
  currentPlan,
  subscription,
  topUp,
}: {
  plan: Plan;
  currentPlan: Plan | undefined;
  subscription: Subscription;
  topUp: TopUpPack | undefined;
}) {
  const checkout = useCreateCheckout();
  const pending = usePendingCheckout();
  const features = plan.features.length > 0 ? plan.features : derivedFeatures(plan, topUp);
  const action = planAction(plan, currentPlan, subscription);
  const current = action.type === "current" || action.type === "current-ending";
  const waiting = pending?.kind === "plan" && pending.planId === plan.id ? pending : null;
  const ends = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : null;

  const start = () =>
    checkout.mutate(
      { kind: "plan", planId: plan.id },
      {
        onSuccess: ({ checkoutUrl, discountApplied }) => {
          startPendingCheckout({ kind: "plan", planId: plan.id, discountApplied, startedAt: new Date().toISOString() });
          leaveTo(checkoutUrl);
        },
      },
    );

  return (
    <section
      aria-label={`${plan.name} plan`}
      className={cn("flex flex-col gap-5 rounded-xl border bg-surface p-5", current ? "border-fg-2" : "border-line")}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{plan.name}</h2>
        {current && <Pill tone="waiting">Your plan</Pill>}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[34px] leading-none font-semibold tracking-[-0.04em]">{formatMoney(plan.priceCents)}</span>
        <span className="text-[13px] text-muted">{plan.interval ? `per ${plan.interval}` : "forever"}</span>
      </div>

      <ul className="flex flex-1 flex-col gap-2.5 text-[13.5px]">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <CheckIcon size={16} className="mt-[2px] shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        {action.type === "current" && (
          <div className="grid h-[34px] place-items-center rounded-[9px] bg-surface-2 text-[13.5px] font-medium text-nav">Current plan</div>
        )}
        {action.type === "current-ending" && (
          <>
            <Button pending={checkout.isPending} onClick={start}>
              Subscribe to {plan.name} again
            </Button>
            <p className="text-[12.5px] text-muted">{ends ? `Yours ends ${ends}.` : "Yours ends with this period."} Subscribing again starts a new month today.</p>
          </>
        )}
        {action.type === "checkout" && (
          <>
            <Button variant="primary" pending={checkout.isPending} onClick={start}>
              {action.verb} {plan.name}
            </Button>
            {action.verb === "Start" && currentPlan && (
              <p className="text-[12.5px] text-muted">
                {plan.name} starts as soon as you pay. Your {currentPlan.name} plan still ends {ends ?? "with this period"}.
              </p>
            )}
          </>
        )}
        {action.type === "blocked" && (
          <>
            <Button disabled>Switch to {plan.name}</Button>
            <p className="text-[12.5px] text-muted">{action.reason}</p>
          </>
        )}
        {action.type === "free" && <p className="text-[12.5px] text-muted">Where you land when a paid plan ends. Cancel above to move here.</p>}

        {checkout.isError && (
          <p role="alert" className="text-[12.5px] text-danger">
            {checkoutError(checkout.error)}
          </p>
        )}
        {waiting && (
          <p role="status" className="rounded-[10px] bg-accent-soft px-3 py-2 text-[12.5px] text-accent-dark">
            Waiting for Polar to confirm your payment. Your plan changes here by itself; if you didn’t finish paying, start again.
            {waiting.discountApplied && <span className="mt-0.5 block font-medium">50% off your first month applied.</span>}
          </p>
        )}
      </div>
    </section>
  );
}

/** The plans side by side, as the API describes them, with the action each one allows right now. */
export function PlanColumns({ plans, topUps, subscription }: { plans: Plan[]; topUps: TopUpPack[]; subscription: Subscription }) {
  const currentPlan = plans.find((p) => p.id === subscription.plan);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] items-stretch gap-4">
      {plans.map((plan) => (
        <PlanColumn key={plan.id} plan={plan} currentPlan={currentPlan} subscription={subscription} topUp={topUps[0]} />
      ))}
    </div>
  );
}
