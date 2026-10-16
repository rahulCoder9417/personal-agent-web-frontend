"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useState } from "react";
import { flowStep, type FlowStep } from "@/lib/automation-flow";
import type { TrailMark } from "@/lib/automation-steps";
import type { AutomationKind } from "@/lib/automations";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { storedFlag, useStoredFlag } from "@/lib/stored-flag";
import { cn } from "@/lib/format";
import { FilterPills } from "../ui";
import { FlowList, StepDetails, StepMark, TRAIL_TAG } from "./flow-parts";

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
  return <div aria-hidden className="h-[260px] w-full animate-pulse rounded-xl border border-line bg-surface-2" />;
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
  label,
  trail,
  summary,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  changed?: ReadonlySet<string>;
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

      {summary && (
        <p role="status" className={cn("w-fit max-w-full rounded-lg px-3 py-1.5 text-[12.5px] font-medium break-words", TRAIL_TAG[summary.tone])}>
          {summary.line}
        </p>
      )}

      {view === "list" ? (
        <FlowList steps={steps} kind={kind} changed={changed} trail={trail} />
      ) : (
        <>
          <div className="md:hidden">
            <FlowList steps={steps} kind={kind} changed={changed} trail={trail} />
          </div>
          <div className="flex min-w-0 gap-4 max-md:hidden max-[1560px]:flex-col">
            <div className="min-w-0 flex-1">
              {!wide ? (
                <CanvasPlaceholder />
              ) : stepped ? (
                <StepsCanvas steps={steps} kind={kind} selected={selected} changed={changed} trail={trail} panelId={panelId} onSelect={onSelect} />
              ) : (
                <FlowCanvas steps={steps} kind={kind} selected={selected} changed={changed} panelId={panelId} onSelect={onSelect} />
              )}
            </div>
            <StepPanel id={panelId} step={open} kind={kind} changed={changed?.has(open.key) ?? false} trail={open.step ? trail?.get(open.step.id) : undefined} />
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
function StepPanel({ id, step, kind, changed, trail }: { id: string; step: FlowStep; kind: AutomationKind; changed: boolean; trail?: TrailMark }) {
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
      {trail && <span className={cn("w-fit rounded px-1.5 text-[11.5px] leading-[18px] font-semibold", TRAIL_TAG[trail.tone])}>Last run: {trail.label}</span>}
      <StepDetails step={step} />
    </aside>
  );
}
