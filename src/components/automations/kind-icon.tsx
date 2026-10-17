import type { ReactNode } from "react";
import type { AutomationKind } from "@/lib/automations";
import { cn } from "@/lib/format";
import { BrandIcon, hasBrandIcon } from "../brand-icon";
import { CalendarIcon, ChatIcon, ClockIcon } from "../icons";
import { AgentFigure } from "../tex";

/** A glyph per kind of automation: a clock for once, a loop for on repeat, a bolt for when something happens. */
export function KindIcon({ kind, size = 18, className }: { kind: AutomationKind; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {kind === "once" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      )}
      {kind === "repeat" && (
        <>
          <path d="M17 3.5 20.5 7 17 10.5" />
          <path d="M3.5 11.5V10a3 3 0 0 1 3-3h14" />
          <path d="M7 20.5 3.5 17 7 13.5" />
          <path d="M20.5 12.5V14a3 3 0 0 1-3 3h-14" />
        </>
      )}
      {kind === "event" && <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />}
    </svg>
  );
}

/**
 * The kinds of box on an automation's canvas, each in its own colour (`--node-<kind>` in
 * globals.css): what starts it (green), a read (blue), an "only if" (amber), Tex or the crew
 * (purple), a write (teal), and where it ends: the results, or a condition's Stop (grey).
 */
export type NodeKind = "trigger" | "read" | "cond" | "tex" | "write" | "end";

function Glyph({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/**
 * A box's mark on its kind's coloured tile, in white: an app's own logo, a schedule's clock, a
 * moment's calendar, the chat, an "only if"'s diamond, a Stop's square. Tex and Patch show their
 * own faces, which are tiles already. Decorative: what it is, is said in words beside it.
 */
export function NodeTile({ kind, logo, iconUrl, size = 36, className }: { kind: NodeKind; logo: string; iconUrl?: string | null; size?: number; className?: string }) {
  const glyph = Math.round(size * 0.5);
  if (logo === "tex" || logo === "patch")
    return (
      <span aria-hidden className={cn("inline-grid shrink-0", className)}>
        <AgentFigure who={logo} mood="ready" glyph size={size} label="" />
      </span>
    );
  let mark: ReactNode;
  if (logo === "schedule") mark = <ClockIcon size={glyph} strokeWidth={2} />;
  else if (logo === "once") mark = <CalendarIcon size={glyph} strokeWidth={2} />;
  else if (logo === "chat") mark = <ChatIcon size={glyph} strokeWidth={2} />;
  else if (logo === "cond")
    mark = (
      <Glyph size={glyph}>
        <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
      </Glyph>
    );
  else if (logo === "stop")
    mark = (
      <Glyph size={glyph}>
        <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      </Glyph>
    );
  else if (hasBrandIcon(logo)) mark = <BrandIcon name={logo} size={glyph} mono />;
  else if (iconUrl)
    // The catalog's own logo can't be drawn in white: it sits on a small white square instead.
    mark = (
      <span className="grid place-items-center rounded-md bg-surface" style={{ width: Math.round(size * 0.66), height: Math.round(size * 0.66) }}>
        <BrandIcon name={logo} size={glyph} iconUrl={iconUrl} />
      </span>
    );
  else
    mark = (
      <Glyph size={glyph}>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
      </Glyph>
    );
  return (
    <span aria-hidden data-kind={kind} className={cn("graph-tile grid shrink-0 place-items-center", className)} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>
      {mark}
    </span>
  );
}
