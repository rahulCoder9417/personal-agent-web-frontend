// Small parts of an automation's flow shared by its views: the apps step's glyph and the "Changed"
// tag. The connected boxes, the badges and the app chips are in flow-chain.tsx; the canvas is
// flow-canvas.tsx (loaded only on an automation's own page). The draft's card in the chat draws its
// steps in its own column (chat/draft-steps.tsx).

import type { TrailMark } from "@/lib/automation-steps";

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

/** How a step went in the last run, as a small tag ("Done", "Waiting for your OK"). */
export const TRAIL_TAG: Record<TrailMark["tone"], string> = {
  done: "bg-success-soft text-success",
  waiting: "bg-[color-mix(in_srgb,var(--patch)_18%,transparent)] text-[color-mix(in_srgb,var(--patch)_70%,var(--fg))]",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-muted",
  running: "bg-accent-soft text-accent-dark",
};

/** The mark on a step that a change would alter. */
export function ChangedTag() {
  return <span className="rounded bg-accent-soft px-1.5 text-[10.5px] leading-[16px] font-semibold text-accent-dark">Changed</span>;
}
