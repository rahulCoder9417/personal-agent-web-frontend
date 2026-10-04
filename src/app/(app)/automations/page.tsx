"use client";

import { useState } from "react";
import { AddAutomationHint } from "@/components/automations/add-hint";
import { AutomationRow } from "@/components/automations/automation-row";
import { PageBody } from "@/components/page";
import { Card, ErrorState, FilterPills, SkeletonRows, type FilterOption } from "@/components/ui";
import type { Automation } from "@/lib/api/client";
import { useAutomations, useMe } from "@/lib/api/hooks";
import { AUTOMATION_KIND_LABEL } from "@/lib/format";

type Kind = "all" | Automation["kind"];

const FILTERS: FilterOption<Kind>[] = [
  { value: "all", label: "All" },
  { value: "once", label: AUTOMATION_KIND_LABEL.once },
  { value: "repeat", label: AUTOMATION_KIND_LABEL.repeat },
  { value: "event", label: AUTOMATION_KIND_LABEL.event },
];

const COLUMN = "text-[11.5px] text-muted";

export default function AutomationsPage() {
  const [kind, setKind] = useState<Kind>("all");
  const automations = useAutomations();
  const me = useMe();
  const all = automations.data ?? [];
  const shown = kind === "all" ? all : all.filter((a) => a.kind === kind);

  return (
    <PageBody width={1080} className="gap-4">
      <div className="flex min-h-[30px] flex-wrap items-center gap-4">
        <FilterPills label="Filter by kind" options={FILTERS} value={kind} onChange={setKind} />
      </div>

      {automations.isError ? (
        <ErrorState error={automations.error} onRetry={() => void automations.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 border-b border-line px-5 py-3 max-lg:hidden">
            <span aria-hidden className="w-[38px] shrink-0" />
            <span className={`${COLUMN} min-w-0 flex-1`}>Automation</span>
            <span className={`${COLUMN} w-[210px] shrink-0`}>When</span>
            <span className={`${COLUMN} w-[170px] shrink-0`}>Next run</span>
            <span className={`${COLUMN} w-[156px] shrink-0 text-right`}>On</span>
          </div>

          {automations.isPending ? (
            <SkeletonRows rows={4} />
          ) : shown.length > 0 ? (
            <ul>
              {shown.map((automation) => (
                <AutomationRow key={automation.id} automation={automation} />
              ))}
            </ul>
          ) : (
            <p className="px-5 py-7 text-muted">
              {all.length === 0 ? "No automations yet. Ask Tex for one and it shows up here." : "No automations of this kind yet."}
            </p>
          )}

          <p className="border-t border-surface-2 px-5 py-3 text-[12px] text-muted">
            {me.data?.timezone ? `Times are in ${me.data.timezone} · ` : ""}automations pause on their own if you run out of credits
          </p>
        </Card>
      )}

      <AddAutomationHint />
    </PageBody>
  );
}
