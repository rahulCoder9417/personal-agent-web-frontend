"use client";

import Link from "next/link";
import { useState } from "react";
import { AutomationCard } from "@/components/automations/automation-card";
import { DraftsWaiting } from "@/components/automations/drafts-waiting";
import { AutomationsIntro } from "@/components/automations/intro";
import { KindIcon } from "@/components/automations/kind-icon";
import { AutomationsOverview } from "@/components/automations/overview";
import { usePlanAutomations } from "@/components/automations/plan-meter";
import { AutomationTemplates, EditorTemplateCards } from "@/components/automations/templates";
import { ChatIcon, PlusIcon } from "@/components/icons";
import { PageBody, READING } from "@/components/page";
import { SegmentedControl, type ChoiceOption } from "@/components/segmented-control";
import { AgentFigure } from "@/components/tex";
import { ButtonLink, ErrorState, Meta, SectionLabel } from "@/components/ui";
import type { Automation } from "@/lib/api/client";
import { useAutomations, useMe } from "@/lib/api/hooks";
import { AUTOMATION_CREDITS } from "@/lib/automations";
import { AUTOMATION_KIND_LABEL, cn } from "@/lib/format";

type Kind = "all" | Automation["kind"];

const KINDS: Automation["kind"][] = ["once", "repeat", "event"];

const STEPS = [
  { title: "Ask Tex", body: "Type it in the box above, pick a template, or say it your own way in chat: what to do, and when." },
  { title: "Tex drafts it", body: "You see it as connected boxes: when it runs, what Tex does with which apps, where the results go. Save it as it is or change a box." },
  { title: "You save it", body: "Nothing runs before you do. Then it shows up here with its next run, and each result lands in your Automations chat." },
];

const CARD_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-3";

/** Nothing made yet: how one comes to exist, as three connected steps, and the canvas templates to start from. */
function NoAutomations() {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-dashed border-line-strong bg-surface/70 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <AgentFigure who="tex" mood="ready" size={72} label="" className="shrink-0 max-sm:hidden" />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">You haven’t made one yet</h3>
          <p className={cn("text-[13.5px] text-muted", READING)}>It takes one message, or a minute on the canvas. Here is what happens, and a few ready-made ones to start from.</p>
        </div>
      </div>
      <ol aria-label="How an automation is made" className="flex gap-0 max-md:flex-col">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex min-w-0 flex-1 items-stretch max-md:flex-col">
            {index > 0 && (
              <span aria-hidden className="flex shrink-0 items-center justify-center max-md:h-4 max-md:w-8 md:w-6">
                <span className="bg-line-strong max-md:h-full max-md:w-px md:h-px md:w-full" />
              </span>
            )}
            <span className="flex min-w-0 flex-1 gap-3 rounded-xl border border-line bg-surface p-3">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-fg text-[12px] font-semibold text-white">
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold">{step.title}</span>
                <span className="text-[12.5px] text-muted">{step.body}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2.5">
        <SectionLabel>Start with one of these</SectionLabel>
        <EditorTemplateCards />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href="/automations/new" variant="primary">
          <PlusIcon size={15} />
          New automation
        </ButtonLink>
        <ButtonLink href="/">
          <ChatIcon size={15} />
          Ask Tex in chat
        </ButtonLink>
      </div>
    </div>
  );
}

/** Placeholder cards while the list loads, in the same grid as the cards. */
function SkeletonCards() {
  return (
    <ul aria-hidden className={CARD_GRID}>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="flex h-[300px] flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <span className="flex items-center gap-3">
            <span className="size-[38px] animate-pulse rounded-[11px] bg-surface-2" />
            <span className="h-3 w-2/5 animate-pulse rounded bg-surface-2" />
          </span>
          {[0, 1, 2].map((row) => (
            <span key={row} className="h-12 animate-pulse rounded-[11px] bg-surface-2" />
          ))}
        </li>
      ))}
    </ul>
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
  const none = automations.isSuccess && all.length === 0;

  const filters: ChoiceOption<Kind>[] = [
    { value: "all", label: "All", count: all.length },
    ...KINDS.map((value) => ({ value, label: AUTOMATION_KIND_LABEL[value], icon: <KindIcon kind={value} size={13} />, count: all.filter((a) => a.kind === value).length })),
  ];

  return (
    <PageBody className="gap-8">
      <AutomationsIntro compact={all.length > 0} />

      {all.length > 0 && <AutomationsOverview automations={all} />}

      <DraftsWaiting timezone={timezone} />

      <section aria-labelledby="your-automations" className="flex min-w-0 flex-col gap-3.5">
        <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <SectionLabel className="text-[15px]">
                <span id="your-automations">Your automations</span>
              </SectionLabel>
              {automations.data && plan && (
                <Meta className="text-[12px]">
                  {all.length} of {plan.limit} on {plan.planName}
                </Meta>
              )}
            </div>
            {all.length > 0 && <p className="text-[12.5px] text-muted">Each card shows when it runs, what Tex does and with which apps, and where the results go.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {all.length > 1 && <SegmentedControl<Kind> label="Show" size="sm" options={filters} value={kind} onChange={setKind} />}
            <ButtonLink href="/automations/new" variant="primary" size="sm">
              <PlusIcon size={14} />
              New automation
            </ButtonLink>
          </div>
        </div>

        {automations.isError ? (
          <ErrorState error={automations.error} onRetry={() => void automations.refetch()} />
        ) : automations.isPending ? (
          <SkeletonCards />
        ) : none ? (
          <NoAutomations />
        ) : shown.length > 0 ? (
          <ul className={CARD_GRID}>
            {shown.map((automation) => (
              <AutomationCard key={automation.id} automation={automation} timezone={timezone} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-line bg-surface px-5 py-7 text-[13.5px] text-muted">None of this kind yet. The templates below have one to start from.</p>
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

      <AutomationTemplates full={full} first={none} />
    </PageBody>
  );
}
