"use client";

import Link from "next/link";
import { useState } from "react";
import { AutomationRow } from "@/components/automations/automation-row";
import { AutomationsChatLink } from "@/components/automations/chat-link";
import { AutomationGuide } from "@/components/automations/guide";
import { usePlanAutomations } from "@/components/automations/plan-meter";
import { AutomationTemplates } from "@/components/automations/templates";
import { PageBody, READING } from "@/components/page";
import { AgentFigure } from "@/components/tex";
import { ButtonLink, Card, ErrorState, FilterPills, Meta, SectionLabel, SkeletonRows, type FilterOption } from "@/components/ui";
import type { Automation } from "@/lib/api/client";
import { useAutomations, useMe } from "@/lib/api/hooks";
import { AUTOMATION_CREDITS } from "@/lib/automations";
import { AUTOMATION_KIND_LABEL, cn } from "@/lib/format";

type Kind = "all" | Automation["kind"];

const FILTERS: FilterOption<Kind>[] = [
  { value: "all", label: "All" },
  { value: "once", label: AUTOMATION_KIND_LABEL.once },
  { value: "repeat", label: AUTOMATION_KIND_LABEL.repeat },
  { value: "event", label: AUTOMATION_KIND_LABEL.event },
];

const STEPS = [
  { title: "Ask Tex", body: "Pick a template, or say it your own way in chat: what to do, and when." },
  { title: "Tex confirms", body: "It tells you what it understood and when it will run. Nothing risky happens without your OK." },
  { title: "It shows up here", body: "With its next run, in plain words. Pause it or delete it whenever you like." },
];

/** Nothing made yet: say how one comes to exist, step by step, instead of showing an empty table. */
function NoAutomations() {
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <AgentFigure who="tex" mood="ready" size={84} label="" className="shrink-0 max-sm:hidden" />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[16px] font-semibold tracking-[-0.01em]">You haven’t made one yet</h3>
          <p className="text-[13.5px] text-muted">It takes one message. Here is what happens.</p>
        </div>
      </div>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-fg text-[12px] font-semibold text-white">
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13.5px] font-semibold">{step.title}</span>
              <span className="text-[13px] text-muted">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <ButtonLink href="/" variant="primary" className="self-start">
        Ask Tex in chat
      </ButtonLink>
    </Card>
  );
}

export default function AutomationsPage() {
  const [kind, setKind] = useState<Kind>("all");
  const automations = useAutomations();
  const me = useMe();
  const plan = usePlanAutomations();
  const all = automations.data ?? [];
  const shown = kind === "all" ? all : all.filter((a) => a.kind === kind);
  const timezone = me.data?.timezone;
  const full = plan && automations.data && all.length >= plan.limit ? plan : null;

  return (
    <PageBody className="gap-8">
      <AutomationGuide />

      {/* Wide: the person's automations with the templates beside them. Narrower: one after the other. */}
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="your-automations" className="flex min-w-0 flex-col gap-3">
          <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-baseline gap-2">
              <SectionLabel>
                <span id="your-automations">Your automations</span>
              </SectionLabel>
              {automations.data && plan && (
                <Meta className="text-[12px]">
                  {all.length} of {plan.limit} on {plan.planName}
                </Meta>
              )}
            </div>
            {all.length > 1 && <FilterPills label="Filter by kind" options={FILTERS} value={kind} onChange={setKind} />}
          </div>

          {all.length > 0 && <AutomationsChatLink />}

          {automations.isError ? (
            <ErrorState error={automations.error} onRetry={() => void automations.refetch()} />
          ) : automations.isPending ? (
            <Card className="overflow-hidden">
              <SkeletonRows rows={3} />
            </Card>
          ) : all.length === 0 ? (
            <NoAutomations />
          ) : (
            <Card className="overflow-hidden">
              {shown.length > 0 ? (
                <ul>
                  {shown.map((automation) => (
                    <AutomationRow key={automation.id} automation={automation} timezone={timezone} />
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-7 text-[13.5px] text-muted">None of this kind yet. The templates have one to start from.</p>
              )}
            </Card>
          )}

          {all.length > 0 && (
            <p className={cn("text-[12.5px] text-muted", READING)}>
              {AUTOMATION_CREDITS} An automation pauses on its own if you run out of credits.
              {timezone && (
                <>
                  {" "}
                  “Your time” is {timezone}; change it in{" "}
                  <Link href="/settings" className="font-medium text-accent hover:text-accent-dark">
                    Settings
                  </Link>
                  .
                </>
              )}
            </p>
          )}
        </section>

        <AutomationTemplates full={full} />
      </div>
    </PageBody>
  );
}
