"use client";

import { useMe, usePlans } from "@/lib/api/hooks";
import { ButtonLink } from "../ui";

/** "4 of 5 on Pro": how many automations the plan allows, with a way up once the limit is hit. */
export function PlanMeter({ used }: { used: number }) {
  const me = useMe();
  const plans = usePlans();
  const plan = plans.data?.plans.find((p) => p.id === me.data?.plan);

  // Keeps its place in the header while the plan loads, so nothing jumps when it arrives.
  if (!plan) return <div aria-hidden className="ml-auto h-8 w-[150px]" />;

  const limit = plan.limits.automations;
  const full = used >= limit;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="flex w-[150px] flex-col gap-[5px]">
        <span className="text-[12px] text-nav">
          {used} of {limit} on {plan.name}
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
      {full && plan.id !== "max" && (
        <ButtonLink href="/settings/plans" size="sm">
          Upgrade
        </ButtonLink>
      )}
    </div>
  );
}
