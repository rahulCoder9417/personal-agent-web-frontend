// An automation drawn as connected boxes, in plain HTML: what each card in the list shows (when it
// runs → what Tex does, with the apps it is connected to → where the results go), the steps one under
// another on a phone and in "List view", and the parts both use: the step's badge and the app chips.
// The badges and chips have the look of the draft's card in the chat (chat/draft-steps.tsx): a
// plain tile with the step's glyph in its colour, and an app's logo and name in a round chip.
//
// It takes any number of steps between the trigger and the results (today's one instruction, or an
// automation with up to six steps): the card folds the ones past the third into "+ N more steps".

import type { ReactNode } from "react";
import type { AppHealth } from "@/lib/automation-apps";
import type { FlowStep, FlowStepId } from "@/lib/automation-flow";
import { EXIT_LABEL, type TrailMark } from "@/lib/automation-steps";
import type { AutomationKind } from "@/lib/automations";
import { cn, titleCase } from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { ChatIcon, LockIcon, WarningIcon } from "../icons";
import { AgentFigure } from "../tex";
import { AppsGlyph, ChangedTag, TRAIL_TAG } from "./flow-parts";
import { KindIcon } from "./kind-icon";

/** The colour of each step's glyph on its badge, from the design tokens (as in the chat's draft card). */
export const GLYPH_TINT: Record<FlowStepId, string> = {
  trigger: "text-tock",
  instruction: "text-accent-dark",
  apps: "text-fg-2",
  asks: "text-[color-mix(in_srgb,var(--patch)_72%,var(--fg))]",
  results: "text-success",
};

/**
 * A step's badge, the same plain tile for every step with its glyph in the step's colour: the
 * kind's clock, loop or bolt (or the watched app's logo), Tex, the apps, a lock, the chat.
 */
export function StepBadge({ step, kind, size = 32, className }: { step: Pick<FlowStep, "id" | "apps">; kind: AutomationKind; size?: number; className?: string }) {
  const glyph = Math.round(size * 0.5);
  const app = step.apps[0];
  let inner: ReactNode;
  if (step.id === "trigger") inner = app ? <BrandIcon name={app} size={glyph} /> : <KindIcon kind={kind} size={glyph} />;
  else if (step.id === "instruction") inner = <AgentFigure who="tex" mood="ready" glyph size={Math.round(size * 0.64)} label="" />;
  else if (step.id === "apps") inner = <AppsGlyph size={glyph} />;
  else if (step.id === "asks") inner = <LockIcon size={glyph} />;
  else inner = <ChatIcon size={glyph} />;
  return (
    <span
      aria-hidden
      data-badge
      className={cn("relative z-[1] grid shrink-0 place-items-center bg-surface shadow-[0_0_0_1px_var(--line-strong)]", GLYPH_TINT[step.id] ?? "text-fg-2", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.31) }}
    >
      {inner}
    </span>
  );
}

/** What a chip says about an app that doesn't work now, for its tooltip and a screen reader. */
const HEALTH_NOTE: Partial<Record<AppHealth, string>> = {
  reconnect: "disconnected: reconnect it",
  connect: "not connected",
  plan: "not on your plan",
};

/** An app's logo and name in a round chip; red, with a warning, when the app doesn't work now. */
export function AppChip({ slug, name, health = "ok", small = false }: { slug: string; name?: string; health?: AppHealth; small?: boolean }) {
  const label = name ?? titleCase(slug);
  const note = HEALTH_NOTE[health];
  return (
    <span
      title={note ? `${label}: ${note}` : label}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-surface font-medium",
        small ? "py-[2px] pr-2 pl-1.5 text-[12px] leading-[18px]" : "py-[3px] pr-2.5 pl-2 text-[12.5px] leading-[18px]",
        note ? "text-danger shadow-[0_0_0_1px_color-mix(in_srgb,var(--danger)_45%,transparent)]" : "text-fg shadow-[0_0_0_1px_var(--line)]",
      )}
    >
      <BrandIcon name={slug} size={small ? 12 : 13} className={note ? "opacity-60 grayscale" : undefined} />
      <span className="truncate">{label}</span>
      {note && <WarningIcon size={small ? 11 : 12} className="shrink-0" />}
      {note && <span className="sr-only">({note})</span>}
    </span>
  );
}

/** Several apps as chips, in a list a screen reader names. */
export function AppChips({
  apps,
  health,
  small,
  label = "Apps",
  className,
}: {
  apps: readonly string[];
  health?: ReadonlyMap<string, AppHealth>;
  small?: boolean;
  label?: string;
  className?: string;
}) {
  if (apps.length === 0) return null;
  return (
    <ul aria-label={label} className={cn("flex min-w-0 flex-wrap gap-1.5", className)}>
      {apps.map((app) => (
        <li key={app} className="flex min-w-0">
          <AppChip slug={app} health={health?.get(app)} small={small} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- the card's connected boxes

/** One box on a card: a step (or a few folded into one), in short. */
export type ChainNode = {
  key: string;
  /** The step whose badge the box wears. */
  step: FlowStep;
  /** Small, above: "When", "Tex does", "Results". */
  label: string;
  /** What it says, in a line or two. */
  title: string;
  /** The apps it is connected to, as chips. */
  apps: string[];
  /** Short notes beside the chips: "Asks first". */
  flags: string[];
  /** "Any of your connected apps", where no app is named. */
  quiet?: string;
  /** A step's "only if", on the line into its box. */
  condition?: string | null;
};

/**
 * The boxes of a card from an automation's steps: the trigger, each step between, and the results.
 * The apps and "asks you first" are folded into the box before them, as its chips and its flag, so
 * a card reads "When → Tex does (with Gmail, Calendar · Asks first) → Results". Past `most` steps in
 * between, the rest are one box: "+ 2 more steps".
 */
export function chainNodes(steps: readonly FlowStep[], most = 3): ChainNode[] {
  const out: ChainNode[] = [];
  for (const [index, step] of steps.entries()) {
    const key = step.key ?? `${step.id}:${index}`;
    const before = out[out.length - 1];
    // A step of an automation with steps is a box of its own: its app (or what Tex reads), its lock, its "only if".
    if (step.step) {
      const flags = step.step.askFirst ? [step.step.locked ? "Always asks first" : "Asks first"] : [];
      out.push({ key, step, label: step.label, title: step.title, apps: [...step.apps], flags, condition: step.step.condition });
      continue;
    }
    if (step.id === "apps" && before) {
      before.apps = [...new Set([...before.apps, ...step.apps])];
      if (step.apps.length === 0) before.quiet = "Any of your connected apps";
      continue;
    }
    if (step.id === "asks" && before) {
      before.flags.push(step.short);
      continue;
    }
    if (step.id === "trigger") out.push({ key, step, label: "When", title: step.title, apps: [], flags: [] });
    else if (step.id === "results") out.push({ key, step, label: "Results", title: step.title, apps: step.apps, flags: [] });
    else if (step.id === "instruction") out.push({ key, step, label: "Tex does", title: step.lines[0] || step.title, apps: [], flags: [] });
    else out.push({ key, step, label: step.label, title: step.title, apps: [...step.apps], flags: [] });
  }
  const middle = out.slice(1, -1);
  if (middle.length <= most || out.length < 3) return out;
  const kept = middle.slice(0, most - 1);
  const folded = middle.slice(most - 1);
  const more: ChainNode = {
    key: "more",
    step: folded[0].step,
    label: "Then",
    title: `+ ${folded.length} more step${folded.length === 1 ? "" : "s"}`,
    apps: [...new Set(folded.flatMap((node) => node.apps))],
    flags: [],
  };
  return [out[0], ...kept, more, out[out.length - 1]];
}

/** The line between two boxes, with its arrowhead, under the badges; a step's "only if" beside it. */
function Connector({ left, condition }: { left: number; condition?: string | null }) {
  return (
    <span className="relative flex min-h-3.5 shrink-0 items-center gap-2" style={{ marginLeft: left }}>
      <svg aria-hidden width="10" height="14" viewBox="0 0 10 14" className="shrink-0 -translate-x-1/2 text-line-strong">
        <path d="M5 0v10.5M2 8l3 3.5L8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {condition && (
        <span className="-ml-1 min-w-0 truncate py-0.5 text-[11.5px]">
          <span className="font-medium text-fg-2">{condition}</span>
          <span className="text-muted"> · {EXIT_LABEL}</span>
        </span>
      )}
    </span>
  );
}

/**
 * An automation as connected boxes on its card: the trigger, Tex's part with the app chips it is
 * connected to, and where the results go. A screen reader hears each step in full. `health` marks
 * the apps that don't work now.
 */
export function FlowChain({
  steps,
  kind,
  health,
  dim = false,
  className,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  health?: ReadonlyMap<string, AppHealth>;
  /** Paused: the boxes are quieter. */
  dim?: boolean;
  className?: string;
}) {
  const nodes = chainNodes(steps);
  return (
    <ol aria-label="How it runs" className={cn("flex flex-col", className)}>
      {nodes.map((node, index) => (
        <li key={node.key} className="flex flex-col">
          {index > 0 && <Connector left={10 + 13} condition={node.condition} />}
          <div className={cn("flex min-w-0 items-start gap-2.5 rounded-[11px] border border-line bg-surface-2/50 px-2.5 py-2", dim && "opacity-75")}>
            <StepBadge step={node.key === "more" ? { id: "apps", apps: [] } : node.step} kind={kind} size={26} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] leading-[14px] font-medium tracking-[0.01em] text-muted">{node.label}</span>
              <span className="line-clamp-2 text-[13px] leading-snug font-medium break-words text-fg">{node.title}</span>
              {(node.apps.length > 0 || node.flags.length > 0 || node.quiet) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <AppChips apps={node.apps} health={health} small label={`Apps for “${node.label}”`} />
                  {node.apps.length === 0 && node.quiet && <span className="text-[12px] text-muted">{node.quiet}</span>}
                  {node.flags.map((flag) => (
                    <span key={flag} className="inline-flex items-center gap-1 text-[12px] text-muted">
                      <LockIcon size={11} className="shrink-0" />
                      {flag}
                    </span>
                  ))}
                </div>
              )}
              <span className="sr-only">
                {node.step.label}: {node.step.title}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- every step, one under another

/** What a step says in full: its details, label by label, and the sentence that explains it. */
export function StepFacts({ step, health }: { step: FlowStep; health?: ReadonlyMap<string, AppHealth> }) {
  return (
    <div className="flex flex-col gap-3">
      {(step.id === "apps" || step.step) && step.apps.length > 0 && <AppChips apps={step.apps} health={health} />}
      <dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {step.details.map((detail) => (
          <div key={`${detail.label}:${detail.value}`} className="contents">
            <dt className="text-muted">{detail.label}</dt>
            <dd className="min-w-0 break-words whitespace-pre-wrap text-fg">{detail.value}</dd>
          </div>
        ))}
      </dl>
      {step.note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-fg-2">{step.note}</p>}
    </div>
  );
}

/**
 * The steps one under another, each a box with everything it says, joined by one line down their
 * badges: an automation on a phone, and on a wide screen when "List view" is picked. `changed`
 * marks the steps a proposed change alters.
 */
export function FlowSteps({
  steps,
  kind,
  changed,
  health,
  trail,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  /** By box key. */
  changed?: ReadonlySet<string>;
  health?: ReadonlyMap<string, AppHealth>;
  /** How each step went in the last run, by the step's own id. */
  trail?: ReadonlyMap<string, TrailMark>;
}) {
  return (
    <ol aria-label="The steps, in order" className="flex flex-col">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const mark = step.step ? trail?.get(step.step.id) : undefined;
        const condition = steps[index + 1]?.step?.condition;
        return (
          <li key={step.key} className="relative flex min-w-0 flex-col">
            {!last && <span aria-hidden className="absolute top-[52px] bottom-0 left-[33px] w-px -translate-x-1/2 bg-line-strong" />}
            <section
              aria-label={step.label}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col gap-3 rounded-xl border bg-surface p-4",
                step.tone === "danger" ? "border-danger/35" : changed?.has(step.key) ? "border-accent/50" : "border-line",
              )}
            >
              <div className="flex items-start gap-3">
                <StepBadge step={step} kind={kind} size={34} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
                    {!step.step && (
                      <>
                        <span className="tabular-nums">{index + 1}</span>
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
                    {changed?.has(step.key) && <ChangedTag />}
                  </span>
                  <h3 className={cn("text-[14.5px] leading-snug font-semibold break-words", step.tone === "paused" && "text-nav")}>{step.title}</h3>
                  {mark && <span className={cn("mt-0.5 w-fit rounded-md px-1.5 text-[11px] leading-[18px] font-semibold", TRAIL_TAG[mark.tone])}>Last run: {mark.label}</span>}
                  {step.id === "trigger" && step.lines.slice(-1).map((line) => (
                    <span key={line} className={cn("text-[12.5px] break-words", step.tone === "danger" ? "font-medium text-danger" : "text-muted")}>
                      {line}
                    </span>
                  ))}
                  {step.id === "results" && step.lines.map((line) => (
                    <span key={line} className="text-[12.5px] text-muted">
                      {line}
                    </span>
                  ))}
                </div>
              </div>
              <StepFacts step={step} health={health} />
            </section>
            {!last && (
              <span className={cn("relative flex items-center gap-2 pl-[52px] text-[12px]", condition ? "min-h-8 py-1" : "h-3")}>
                {condition && (
                  <>
                    <span className="font-medium text-fg-2">{condition}</span>
                    <span className="text-muted">· {EXIT_LABEL}</span>
                  </>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
