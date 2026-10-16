"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useState } from "react";
import type { AppHealth } from "@/lib/automation-apps";
import { flowStep, type FlowStep } from "@/lib/automation-flow";
import type { TrailMark } from "@/lib/automation-steps";
import type { AutomationKind } from "@/lib/automations";
import { cn } from "@/lib/format";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { storedFlag, useStoredFlag } from "@/lib/stored-flag";
import { SegmentedControl } from "../segmented-control";
import { LockIcon } from "../icons";
import { FlowSteps, StepBadge, StepFacts } from "./flow-chain";
import { TRAIL_TAG } from "./flow-parts";

// An automation (or a draft) drawn as its flow: on a wide screen the canvas with the open step's
// details beside it, on a phone the steps as a list of cards. The canvas library is a chunk of its
// own, asked for only here and only once the screen is known to be wide, so a phone never fetches
// it (and nor does any other page).

const FlowCanvas = dynamic(() => import("./flow-canvas"), {
  ssr: false,
  loading: () => <CanvasPlaceholder />,
});
/** An automation with steps: its own chunk, with dagre for the layout (steps-canvas.tsx). */
const StepsCanvas = dynamic(() => import("./steps-canvas"), {
  ssr: false,
  loading: () => <CanvasPlaceholder />,
});

/** Where the canvas will be, while its chunk loads (or the screen's width isn't known yet). */
function CanvasPlaceholder() {
  return <div aria-hidden className="h-[256px] w-full animate-pulse rounded-2xl border border-line bg-surface-2" />;
}

/** "List view", chosen on a wide screen, is remembered by this browser. */
const listViewFlag = storedFlag("tc:automation-list-view");

type View = "canvas" | "list";

/**
 * The steps on a canvas or as a list. `changed` marks the boxes a proposed change alters (by key).
 * `label` names what is drawn, for screen readers ("Monday PRs, step by step"). `trail`: how each
 * step of an automation with steps went in its last run (by step id), and `summary` that run in a
 * line, over the canvas.
 */
export function FlowView({
  steps,
  kind,
  changed,
  health,
  label,
  trail,
  summary,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  changed?: ReadonlySet<string>;
  /** How each app stands, so a disconnected one is marked where it is named. */
  health?: ReadonlyMap<string, AppHealth>;
  label: string;
  trail?: ReadonlyMap<string, TrailMark>;
  summary?: { line: string; tone: TrailMark["tone"] } | null;
}) {
  const wide = useMediaQuery(SHOWN_AT.sidebar);
  const listChosen = useStoredFlag(listViewFlag);
  const [selected, setSelected] = useState<string>("trigger");
  const panelId = useId();
  const onSelect = useCallback((key: string) => setSelected(key), []);
  const view: View = listChosen ? "list" : "canvas";
  const open = flowStep(steps, selected);
  const stepped = steps.some((step) => step.step);

  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[12.5px] text-muted">
          {wide && view === "canvas" ? "Pick a step to see everything it says. Drag to move around." : "Each step, in the order Tex runs them."}
        </p>
        {/* A phone always has the list, so the choice is offered only where the canvas fits. */}
        <div className="max-md:hidden">
          <SegmentedControl<View>
            label="How to show it"
            size="sm"
            options={[
              { value: "canvas", label: "Canvas" },
              { value: "list", label: "List view" },
            ]}
            value={view}
            onChange={(next) => listViewFlag.set(next === "list")}
          />
        </div>
      </div>

      {summary && (
        <p role="status" className={cn("w-fit max-w-full rounded-lg px-3 py-1.5 text-[12.5px] font-medium break-words", TRAIL_TAG[summary.tone])}>
          {summary.line}
        </p>
      )}

      {view === "list" ? (
        <FlowSteps steps={steps} kind={kind} changed={changed} health={health} trail={trail} />
      ) : (
        <>
          <div className="md:hidden">
            <FlowSteps steps={steps} kind={kind} changed={changed} health={health} trail={trail} />
          </div>
          <div className="flex min-w-0 gap-4 max-md:hidden max-[1560px]:flex-col">
            <div className="min-w-0 flex-1">
              {!wide ? (
                <CanvasPlaceholder />
              ) : stepped ? (
                <StepsCanvas steps={steps} kind={kind} selected={selected} changed={changed} trail={trail} health={health} panelId={panelId} onSelect={onSelect} />
              ) : (
                <FlowCanvas steps={steps} kind={kind} selected={selected} changed={changed} health={health} panelId={panelId} onSelect={onSelect} />
              )}
            </div>
            <StepPanel
              id={panelId}
              step={open}
              index={steps.indexOf(open)}
              total={steps.length}
              kind={kind}
              changed={changed?.has(open.key) ?? false}
              health={health}
              trail={open.step ? trail?.get(open.step.id) : undefined}
              numbered={!stepped}
            />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The open step's details: under the canvas, which then has the whole width for its boxes, and
 * beside it on a very wide screen.
 */
function StepPanel({
  id,
  step,
  index,
  total,
  kind,
  changed,
  health,
  trail,
  numbered,
}: {
  /** The boxes are named by place ("Step 2 of 5"); a flow with steps names its steps itself. */
  numbered: boolean;
  id: string;
  step: FlowStep;
  index: number;
  total: number;
  kind: AutomationKind;
  changed: boolean;
  health?: ReadonlyMap<string, AppHealth>;
  trail?: TrailMark;
}) {
  return (
    <aside
      id={id}
      aria-live="polite"
      aria-label={`${step.label}, in full`}
      className="flex w-[360px] shrink-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-4 max-[1560px]:w-full sm:p-5"
    >
      <div className="flex items-start gap-3">
        <StepBadge step={step} kind={kind} size={36} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            {/* A step of an automation with steps is named "Step 2 · Gmail" already. */}
            {numbered && (
              <>
                <span className="tabular-nums">
                  Step {index + 1} of {total}
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            {step.label}
            {step.step?.askFirst && (
              <span title={step.step.locked ? "Always asks you first" : "Asks you first"} className="inline-flex">
                <LockIcon size={12} />
                <span className="sr-only">{step.step.locked ? "Always asks you first" : "Asks you first"}</span>
              </span>
            )}
            {/* In words here: the box on the canvas wears the "Changed" tag. */}
            {changed && <span className="font-semibold text-accent-dark">· changed</span>}
          </span>
          <h3 className="text-[15px] leading-snug font-semibold break-words">{step.title}</h3>
          {step.step?.condition && <span className="text-[12.5px] text-fg-2">{step.step.condition}</span>}
        </div>
      </div>
      {trail && <span className={cn("w-fit rounded-md px-1.5 text-[11.5px] leading-[18px] font-semibold", TRAIL_TAG[trail.tone])}>Last run: {trail.label}</span>}
      <StepFacts step={step} health={health} />
    </aside>
  );
}
