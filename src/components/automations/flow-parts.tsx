// The parts of an automation's flow drawn in plain HTML: the mark of each step, the strip on a card
// (the five steps side by side), and the list that stands in for the canvas on a phone. No drawing
// library: the canvas (flow-canvas.tsx) is loaded only on an automation's own page. The draft's card
// in the chat draws its steps in its own column (chat/draft-steps.tsx).

import type { ReactNode } from "react";
import type { FlowStep, FlowStepId } from "@/lib/automation-flow";
import { cn } from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { ChatIcon, LockIcon } from "../icons";
import { AgentFigure } from "../tex";
import { KindIcon } from "./kind-icon";
import type { AutomationKind } from "@/lib/automations";

/** Each step's colour, from the design tokens. */
const STEP_TINT: Record<FlowStepId, string> = {
  trigger: "bg-[color-mix(in_srgb,var(--tock)_14%,transparent)] text-tock",
  instruction: "bg-accent-soft text-accent-dark",
  apps: "bg-surface-2 text-fg-2",
  asks: "bg-[color-mix(in_srgb,var(--patch)_18%,transparent)] text-[color-mix(in_srgb,var(--patch)_70%,var(--fg))]",
  results: "bg-success-soft text-success",
};

/** The mark of a step: when it runs (or the app it watches), Tex, the apps, a lock, the chat. */
export function StepMark({ step, kind, size = 28 }: { step: FlowStep; kind: AutomationKind; size?: number }) {
  const glyph = Math.round(size * 0.58);
  let inner: ReactNode;
  if (step.id === "trigger") inner = step.apps[0] ? <BrandIcon name={step.apps[0]} size={glyph} /> : <KindIcon kind={kind} size={glyph} />;
  else if (step.id === "instruction") inner = <AgentFigure who="tex" mood="ready" glyph size={Math.round(size * 0.8)} label="" />;
  else if (step.id === "apps") inner = step.apps[0] ? <BrandIcon name={step.apps[0]} size={glyph} /> : <AppsGlyph size={glyph} />;
  else if (step.id === "asks") inner = <LockIcon size={glyph} />;
  else inner = <ChatIcon size={glyph} />;
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", step.apps[0] && step.id !== "results" ? "bg-surface-2" : STEP_TINT[step.id])}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      {inner}
    </span>
  );
}

/** The apps step's own glyph, when it names no app. */
export function AppsGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

/** The other marks a step names (more apps, the chat app a copy goes to), small, after its words. */
function ExtraMarks({ step }: { step: FlowStep }) {
  const extra = step.id === "results" ? step.apps : step.apps.slice(1);
  if (extra.length === 0) return null;
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      {extra.slice(0, 3).map((app) => (
        <BrandIcon key={app} name={app} size={12} />
      ))}
    </span>
  );
}

function Arrow({ down }: { down?: boolean }) {
  return (
    <svg aria-hidden width={down ? 10 : 14} height={down ? 14 : 10} viewBox={down ? "0 0 10 14" : "0 0 14 10"} className="shrink-0 text-line-strong">
      {down ? (
        <path d="M5 0v11M1.5 8 5 12l3.5-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M0 5h11M8 1.5 12 5 8 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * The five steps side by side, a word or two each, joined by arrows: the strip on an automation's
 * card. It wraps onto a second line where the card is narrow. Screen readers hear each step in full.
 */
export function FlowStrip({ steps, kind, className }: { steps: readonly FlowStep[]; kind: AutomationKind; className?: string }) {
  return (
    <ol aria-label="How it runs" className={cn("flex flex-wrap items-center gap-x-1 gap-y-1.5", className)}>
      {steps.map((step, index) => (
        <li key={step.id} className="flex min-w-0 items-center gap-1">
          {index > 0 && <Arrow />}
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-surface-2 py-1 pr-2 pl-1">
            <StepMark step={step} kind={kind} size={20} />
            <span aria-hidden className="truncate text-[12px] font-medium text-fg-2">
              {step.short}
            </span>
            <ExtraMarks step={step} />
            <span className="sr-only">
              {step.label}: {step.title}
              {step.lines.length ? `. ${step.lines.join(". ")}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The mark on a step that a change would alter. */
export function ChangedTag() {
  return <span className="rounded bg-accent-soft px-1.5 text-[10.5px] leading-[16px] font-semibold text-accent-dark">Changed</span>;
}

/**
 * The short lines under a step's title in the list: a copy to Telegram, a trigger's state. The
 * instruction is in its details already, and so are a trigger's settings.
 */
function headLines(step: FlowStep): string[] {
  if (step.id === "instruction") return [];
  if (step.id === "trigger") return step.lines.slice(-1);
  return step.lines;
}

/** What a step says in full: its details, label by label, and the sentence that explains it. */
export function StepDetails({ step }: { step: FlowStep }) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {step.details.map((detail) => (
          <div key={`${detail.label}:${detail.value}`} className="contents">
            <dt className="text-muted">{detail.label}</dt>
            <dd className="min-w-0 break-words whitespace-pre-wrap text-fg">{detail.value}</dd>
          </div>
        ))}
      </dl>
      {step.note && <p className="text-[12.5px] leading-relaxed text-muted">{step.note}</p>}
    </div>
  );
}

/**
 * The five steps as a list of cards, one under another, each with everything it says: the canvas
 * on a phone, and on a wide screen when "List view" is picked.
 */
export function FlowList({
  steps,
  kind,
  changed,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  changed?: ReadonlySet<FlowStepId>;
}) {
  return (
    <ol aria-label="The steps, in order" className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.id} className="flex flex-col">
          {index > 0 && (
            <span className="flex h-6 items-center pl-[21px]">
              <Arrow down />
            </span>
          )}
          <section
            aria-label={step.label}
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-surface p-4",
              step.tone === "danger" ? "border-danger/30" : changed?.has(step.id) ? "border-accent/50" : "border-line",
            )}
          >
            <div className="flex items-start gap-3">
              <StepMark step={step} kind={kind} size={34} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <span className="tabular-nums">{index + 1}.</span> {step.label}
                  {changed?.has(step.id) && <ChangedTag />}
                </span>
                <h3 className={cn("text-[14.5px] leading-snug font-semibold break-words", step.tone === "paused" && "text-nav")}>{step.title}</h3>
                {headLines(step).map((line) => (
                  <span key={line} className={cn("text-[12.5px] break-words", step.tone === "danger" && line.startsWith("Paused") ? "font-medium text-danger" : "text-muted")}>
                    {line}
                  </span>
                ))}
              </div>
            </div>
            <StepDetails step={step} />
          </section>
        </li>
      ))}
    </ol>
  );
}
