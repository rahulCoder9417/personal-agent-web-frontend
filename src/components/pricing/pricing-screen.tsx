"use client";

import { Suspense } from "react";
import { PricingIcon } from "@/components/icons";
import { Page, PageBody, PageHeader } from "@/components/page";
import { SettingsGroup } from "@/components/settings/settings-rows";
import { ErrorState } from "@/components/ui";
import type { Plan, Subscription, TopUpPack } from "@/lib/api/client";
import { usePlans, useSubscription } from "@/lib/api/hooks";
import { CheckoutReturn } from "./checkout-return";
import { CurrentPlan } from "./current-plan";
import { HowCreditsWork } from "./how-credits-work";
import { PlanColumns } from "./plan-columns";
import { TopUps } from "./top-ups";

/** The page's shape while the plans and the subscription load. */
function Loading() {
  return (
    <div aria-hidden data-loading className="flex flex-col gap-7">
      <div className="h-[230px] animate-pulse rounded-xl bg-surface-2" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(228px,100%),1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[340px] animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

/** Every section, once the plans and the subscription are in. */
function Sections({ plans, topUps, subscription }: { plans: Plan[]; topUps: TopUpPack[]; subscription: Subscription }) {
  const current = plans.find((p) => p.id === subscription.plan);
  return (
    <>
      <Suspense fallback={null}>
        <CheckoutReturn />
      </Suspense>

      <SettingsGroup id="your-plan" title="Your plan" description="What you pay now, what happens next, and the credits you have.">
        <CurrentPlan subscription={subscription} plan={current} free={plans.find((p) => p.priceCents === 0)} topUp={topUps[0]} />
      </SettingsGroup>

      <SettingsGroup
        id="plans"
        title="Plans"
        description="Pro and Max add credits every month and unlock more. You pay on Polar’s page, and your plan changes as soon as Polar confirms it."
      >
        <PlanColumns plans={plans} topUps={topUps} subscription={subscription} />
        <p className="flex items-start gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-[13.5px] text-accent-dark">
          <PricingIcon size={16} className="mt-[2px] shrink-0" />
          <span>Waitlist members get 50% off their first month of Pro or Max. If it applies to you, checkout shows it before you pay.</span>
        </p>
      </SettingsGroup>

      {/* Side by side when the page itself has the room (beside the sidebar there is less of it). */}
      <div className="@container">
        <div className="grid grid-cols-1 items-start gap-7 @min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <SettingsGroup id="top-ups" title="Top-ups" description="Extra credits for when you run low, on Pro and Max. They come on top of your plan’s.">
            <TopUps packs={topUps} allowed={current?.limits.topUps ?? false} />
          </SettingsGroup>
          <SettingsGroup id="credits" title="How credits work" description="1 credit is about 1 cent. Every plan runs on them, so you pay for the work Tex does.">
            <HowCreditsWork />
          </SettingsGroup>
        </div>
      </div>

      <p className="text-[12px] text-muted">Checkout and billing are handled by Polar; we never see card details. Your plan changes once Polar confirms the payment.</p>
    </>
  );
}

/**
 * Pricing: your plan (with Cancel), every plan side by side, top-ups, and how credits work. The
 * credit history stays in Settings → Credits; Settings → Plans leads here.
 */
export function PricingScreen() {
  const plans = usePlans();
  const subscription = useSubscription();

  let body;
  if (plans.isError) body = <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />;
  else if (subscription.isError) body = <ErrorState error={subscription.error} onRetry={() => void subscription.refetch()} />;
  else if (plans.isPending || subscription.isPending) body = <Loading />;
  else body = <Sections plans={plans.data.plans} topUps={plans.data.topUps} subscription={subscription.data} />;

  return (
    <Page>
      <PageHeader title="Pricing" />
      <PageBody>{body}</PageBody>
    </Page>
  );
}
