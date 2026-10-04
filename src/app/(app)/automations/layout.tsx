"use client";

import type { ReactNode } from "react";
import { PlanMeter } from "@/components/automations/plan-meter";
import { Page, PageHeader } from "@/components/page";
import { RouteTabs } from "@/components/route-tabs";
import { useAutomations } from "@/lib/api/hooks";

/**
 * Automations and pull-request review share a header: a repo with review on is an automation too,
 * so the plan meter counts both.
 */
export default function AutomationsLayout({ children }: { children: ReactNode }) {
  const automations = useAutomations();

  return (
    <Page>
      <PageHeader title="Automations">
        <RouteTabs
          label="Automations sections"
          tabs={[
            { href: "/automations", label: "All automations", exact: true },
            { href: "/automations/reviews", label: "Pull-request review" },
          ]}
        />
        {automations.data ? <PlanMeter used={automations.data.length} /> : <div aria-hidden className="ml-auto h-8 w-[150px]" />}
      </PageHeader>
      {children}
    </Page>
  );
}
