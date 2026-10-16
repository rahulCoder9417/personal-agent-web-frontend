"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useState } from "react";
import { flowStep, type FlowStep, type FlowStepId } from "@/lib/automation-flow";
import type { AutomationKind } from "@/lib/automations";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { storedFlag, useStoredFlag } from "@/lib/stored-flag";
import { FilterPills } from "../ui";
import { FlowList, StepDetails, StepMark } from "./flow-parts";

// An automation (or a draft) drawn as its flow: on a wide screen the canvas with the open step's
// details beside it, on a phone the steps as a list of cards. The canvas library is a chunk of its
// own, asked for only here and only once the screen is known to be wide, so a phone never fetches
// it (and nor does any other page).

const FlowCanvas = dynamic(() => import("./flow-canvas"), {
  ssr: false,
  loading: () => <CanvasPlaceholder />,
});

/** Where the canvas will be, while its chunk loads (or the screen's width isn't known yet). */
function CanvasPlaceholder() {
  return <div aria-hidden className="h-[260px] w-full animate-pulse rounded-xl border border-line bg-surface-2" />;
}

/** "List view", chosen on a wide screen, is remembered by this browser. */
const listViewFlag = storedFlag("tc:automation-list-view");

type View = "canvas" | "list";

/**
 * The steps on a canvas or as a list. `changed` marks the steps a proposed change alters.
 * `label` names what is drawn, for screen readers ("Monday PRs, step by step").
 */
export function FlowView({
  steps,
  kind,
  changed,
  label,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  changed?: ReadonlySet<FlowStepId>;
  label: string;
}) {
  const wide = useMediaQuery(SHOWN_AT.sidebar);
  const listChosen = useStoredFlag(listViewFlag);
  const [selected, setSelected] = useState<FlowStepId>("trigger");
  const panelId = useId();
  const onSelect = useCallback((id: FlowStepId) => setSelected(id), []);
  const view: View = listChosen ? "list" : "canvas";
  const open = flowStep(steps, selected);

  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[12.5px] text-muted">
          {wide && view === "canvas" ? "Pick a step to see everything it says. Drag to move around." : "Each step, in the order Tex runs them."}
        </p>
        {/* A phone always has the list, so the choice is offered only where the canvas fits. */}
        <div className="max-md:hidden">
          <FilterPills<View>
            label="How to show it"
            options={[
              { value: "canvas", label: "Canvas" },
              { value: "list", label: "List view" },
            ]}
            value={view}
            onChange={(next) => listViewFlag.set(next === "list")}
          />
        </div>
      </div>

      {view === "list" ? (
        <FlowList steps={steps} kind={kind} changed={changed} />
      ) : (
        <>
          <div className="md:hidden">
            <FlowList steps={steps} kind={kind} changed={changed} />
          </div>
          <div className="flex min-w-0 gap-4 max-md:hidden max-[1560px]:flex-col">
            <div className="min-w-0 flex-1">
              {wide ? (
                <FlowCanvas steps={steps} kind={kind} selected={selected} changed={changed} panelId={panelId} onSelect={onSelect} />
              ) : (
                <CanvasPlaceholder />
              )}
            </div>
            <StepPanel id={panelId} step={open} kind={kind} changed={changed?.has(open.id) ?? false} />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The open step's details: under the canvas, which then has the whole width for its five boxes, and
 * beside it on a very wide screen.
 */
function StepPanel({ id, step, kind, changed }: { id: string; step: FlowStep; kind: AutomationKind; changed: boolean }) {
  return (
    <aside
      id={id}
      aria-live="polite"
      aria-label={`${step.label}, in full`}
      className="flex w-[340px] shrink-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4 max-[1560px]:w-full"
    >
      <div className="flex items-start gap-3">
        <StepMark step={step} kind={kind} size={34} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12px] text-muted">
            {step.label}
            {changed && <span className="font-medium text-accent-dark"> · changed</span>}
          </span>
          <h3 className="text-[15px] leading-snug font-semibold break-words">{step.title}</h3>
        </div>
      </div>
      <StepDetails step={step} />
    </aside>
  );
}
