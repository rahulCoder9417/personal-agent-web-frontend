"use client";

import { useMe, usePlans } from "@/lib/api/hooks";
import { ButtonLink } from "../ui";
import { PRICING_PATH } from "@/lib/pricing";

export type PlanAutomations = {
  planName: string;
  /** How many automations the plan allows. A repo with pull-request review on counts as one. */
  limit: number;
  /** Whether another plan allows more. */
  canUpgrade: boolean;
};

/** What the person's plan allows in automations. Null until the account and the plans have loaded. */
export function usePlanAutomations(): PlanAutomations | null {
  const me = useMe();
  const plans = usePlans();
  const plan = plans.data?.plans.find((p) => p.id === me.data?.plan);
  if (!plan) return null;
  const limit = plan.limits.automations;
  return { planName: plan.name, limit, canUpgrade: plans.data?.plans.some((p) => p.limits.automations > limit) ?? false };
}

/** "4 of 5 on Pro": how many automations the plan allows, with a way up once the limit is hit. */
export function PlanMeter({ used }: { used: number }) {
  const plan = usePlanAutomations();

  // Keeps its place in the header while the plan loads, so nothing jumps when it arrives.
  if (!plan) return <div aria-hidden className="ml-auto h-8 w-[150px]" />;

  const { limit } = plan;
  const full = used >= limit;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="flex w-[150px] flex-col gap-[5px]">
        <span className="text-[12px] text-nav">
          {used} of {limit} on {plan.planName}
        </span>
        <span
          role="progressbar"
          aria-label="Automations used"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          className="block h-1 rounded-sm bg-line"
        >
          <span className="block h-1 rounded-sm bg-fg" style={{ width: `${percent}%` }} />
        </span>
      </div>
      {full && plan.canUpgrade && (
        <ButtonLink href={PRICING_PATH} size="sm">
          Upgrade
        </ButtonLink>
      )}
    </div>
  );
}
