// The steps of a draft Tex proposed, one under another, in its card in the chat: a column of badges,
// all the same size, joined by one thin line, and beside each badge the step's name with what it says
// under it. Plain HTML, no canvas. It takes any number of steps: today's five, or an automation with
// steps (the trigger, up to six steps, the results).

import type { ReactNode } from "react";
import type { FlowStep, FlowStepId } from "@/lib/automation-flow";
import type { AutomationKind } from "@/lib/automations";
import { cn, listNames, titleCase } from "@/lib/format";
import { AppsGlyph } from "../automations/flow-parts";
import { ClampedText } from "../automations/clamped-text";
import { KindIcon } from "../automations/kind-icon";
import { BrandIcon } from "../brand-icon";
import { ChatIcon, LockIcon } from "../icons";
import { AgentFigure } from "../tex";

/** The colour of each step's glyph on its badge, from the design tokens. */
const GLYPH_TINT: Record<FlowStepId, string> = {
  trigger: "text-tock",
  instruction: "text-accent-dark",
  apps: "text-fg-2",
  asks: "text-[color-mix(in_srgb,var(--patch)_72%,var(--fg))]",
  results: "text-success",
};

/** The size of every badge, and of the glyph on it. */
const BADGE = 32;
const GLYPH = 16;

/**
 * A step's badge: the same plain tile for every step, its glyph in the step's colour. A trigger on an
 * app's event shows the app's logo; the apps step its own glyph, as its apps are named in chips.
 */
function StepBadge({ step, kind }: { step: FlowStep; kind: AutomationKind }) {
  const app = step.apps[0];
  let inner: ReactNode;
  if (step.id === "trigger") inner = app ? <BrandIcon name={app} size={GLYPH} /> : <KindIcon kind={kind} size={GLYPH} />;
  else if (step.id === "instruction") inner = <AgentFigure who="tex" mood="ready" glyph size={20} label="" />;
  else if (step.id === "apps") inner = <AppsGlyph size={GLYPH} />;
  else if (step.id === "asks") inner = <LockIcon size={GLYPH} />;
  else inner = <ChatIcon size={GLYPH} />;
  return (
    <span
      aria-hidden
      data-badge
      className={cn("relative z-[1] grid shrink-0 place-items-center rounded-[10px] bg-surface shadow-[0_0_0_1px_var(--line-strong)]", GLYPH_TINT[step.id])}
      style={{ width: BADGE, height: BADGE }}
    >
      {inner}
    </span>
  );
}

/** The apps a step names, as small chips: the app's logo and its name. */
function AppChips({ apps }: { apps: readonly string[] }) {
  return (
    <ul aria-label="Apps" className="flex flex-wrap gap-1.5">
      {apps.map((app) => (
        <li
          key={app}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface py-[3px] pr-2.5 pl-2 text-[12.5px] leading-[18px] font-medium text-fg shadow-[0_0_0_1px_var(--line)]"
        >
          <BrandIcon name={app} size={13} />
          {titleCase(app)}
        </li>
      ))}
    </ul>
  );
}

const VALUE = "text-[13.5px] leading-[1.45] font-medium break-words text-fg";
const SUB = "text-[12.5px] leading-[1.45] break-words text-muted";

/**
 * What a step says under its name. `heading` is the title the card shows above the steps: the
 * instruction doesn't say it again. Tex's instruction is cut to three lines, with Show more.
 */
function StepBody({ step, heading }: { step: FlowStep; heading?: string }) {
  if (step.id === "instruction") {
    const instruction = step.lines[0];
    const showTitle = !instruction || step.title !== heading;
    return (
      <>
        {showTitle && <p className={VALUE}>{step.title}</p>}
        {instruction && instruction !== step.title && (
          <ClampedText text={instruction} className={cn("text-[13px] leading-[1.5]", showTitle ? "mt-0.5 text-fg-2" : "text-fg")} />
        )}
      </>
    );
  }

  if (step.id === "apps" && step.apps.length) {
    // The chips name the apps; a title that says more than their names (an app's action) stays.
    const namesOnly = step.title === listNames(step.apps.map(titleCase), "and");
    return (
      <>
        {!namesOnly && <p className={cn(VALUE, "mb-1.5")}>{step.title}</p>}
        <AppChips apps={step.apps} />
      </>
    );
  }

  // A draft isn't saved: the card says so once, at its top.
  const lines = step.lines.filter((line) => line !== "Not saved yet");
  return (
    <>
      <p className={VALUE}>{step.title}</p>
      {lines.map((line) => (
        <p key={line} className={cn(SUB, "mt-0.5 flex items-center gap-1.5")}>
          {step.id === "results" && step.apps[0] && <BrandIcon name={step.apps[0]} size={12} />}
          <span className="min-w-0">{line}</span>
        </p>
      ))}
    </>
  );
}

export function DraftSteps({ steps, kind, heading, className }: { steps: readonly FlowStep[]; kind: AutomationKind; heading?: string; className?: string }) {
  return (
    <ol aria-label="How it would run" className={cn("flex flex-col", className)}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          // A flow with steps has several of Tex's and the apps' boxes: the place keeps the keys apart.
          <li key={`${step.id}:${index}`} className={cn("relative flex min-w-0 items-start gap-3", !last && "pb-5")}>
            {/* The line down to the next badge, from this one's foot to the next one's head. */}
            {!last && <span aria-hidden data-line className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-line-strong" />}
            <StepBadge step={step} kind={kind} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11.5px] leading-4 font-medium text-muted">{step.label}</span>
              <div className="mt-1 flex min-w-0 flex-col">
                <StepBody step={step} heading={heading} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
