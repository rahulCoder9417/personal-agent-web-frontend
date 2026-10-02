"use client";

import { useState } from "react";
import { PageBody } from "@/components/page";
import { BalanceCard } from "@/components/settings/credits-balance";
import { LedgerCard } from "@/components/settings/credits-ledger";
import { CreditsExplainer, RedeemCard, TopUpCard } from "@/components/settings/credits-side";
import { UsageChart } from "@/components/settings/credits-usage-chart";
import { Card, ErrorState, SkeletonRows } from "@/components/ui";
import { useCredits, useMe, usePlans, useUsage } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

const USAGE_DAYS = 14;

/** The last 14 days, from the start of the first day until now. */
function usageRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (USAGE_DAYS - 1));
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function UsageCard() {
  // Fixed for the life of the page, so the query key doesn't change on every render.
  const [range] = useState(usageRange);
  const usage = useUsage(range.from, range.to);

  return (
    <Card role="group" aria-label="Usage" className="flex flex-col gap-4 px-6 py-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Credits used per day</h2>
        <span className="text-[12px] text-muted">
          last {USAGE_DAYS} days · {formatDate(range.from)} to {formatDate(range.to)}
        </span>
      </div>

      {usage.isPending ? (
        <div aria-hidden className="h-[230px] animate-pulse rounded-xl bg-surface-2" />
      ) : usage.isError ? (
        <ErrorState error={usage.error} onRetry={() => usage.refetch()} className="border-0 py-6" />
      ) : usage.data.items.length === 0 ? (
        <p className="py-6 text-[13.5px] text-muted">Nothing used in the last {USAGE_DAYS} days.</p>
      ) : (
        <>
          <UsageChart periods={usage.data.items} totals={usage.data.totals} />
          <p className="border-t border-line pt-3.5 text-[13px] text-muted">
            {usage.data.totals.aiCredits === 0
              ? "The AI runs on your own key or plan, so it uses no credits here. Credits pay for the time Tex spends working and for paid tools."
              : "Credits pay for the AI, the time Tex spends working, and paid tools."}
          </p>
        </>
      )}
    </Card>
  );
}

export default function CreditsPage() {
  const credits = useCredits();
  const plans = usePlans();
  const me = useMe();

  const plan = plans.data?.plans.find((p) => p.id === me.data?.plan);
  // Until both have loaded, don't tell a paying user they can't top up.
  const topUpsAllowed = plan ? plan.limits.topUps : me.data ? me.data.plan !== "free" : true;

  return (
    <PageBody>
      <div className="grid grid-cols-1 items-start gap-6 min-[980px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {credits.isPending ? (
            <Card>
              <SkeletonRows rows={3} />
            </Card>
          ) : credits.isError ? (
            <ErrorState error={credits.error} onRetry={() => credits.refetch()} />
          ) : (
            <BalanceCard credits={credits.data} />
          )}
          <UsageCard />
        </div>

        <div className="flex flex-col gap-4">
          {plans.isPending ? (
            <div aria-hidden className="h-[190px] animate-pulse rounded-xl bg-surface-2" />
          ) : plans.isError ? (
            <ErrorState error={plans.error} onRetry={() => plans.refetch()} className="py-6" />
          ) : (
            <TopUpCard packs={plans.data?.topUps ?? []} allowed={topUpsAllowed} />
          )}
          <RedeemCard />
          <CreditsExplainer />
        </div>
      </div>

      <LedgerCard />
    </PageBody>
  );
}
