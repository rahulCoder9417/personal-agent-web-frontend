import type { AutomationKind } from "@/lib/automations";
import { cn } from "@/lib/format";
import { BrandIcon } from "../brand-icon";

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

/** The glyph's colour of each kind on a plain badge (the badges of the steps have the same look). */
const KIND_GLYPH: Record<AutomationKind, string> = {
  once: "text-accent-dark",
  repeat: "text-scout",
  event: "text-tock",
};

/**
 * An automation's badge: a plain tile with the kind's glyph in its colour, or the logo of the app
 * its trigger watches. The same look as each step's badge, so the page has one kind of badge.
 */
export function KindBadge({ kind, app, size = 40, dim = false, className }: { kind: AutomationKind; app?: string | null; size?: number; dim?: boolean; className?: string }) {
  const glyph = Math.round(size * 0.5);
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center bg-surface shadow-[0_0_0_1px_var(--line-strong)]", KIND_GLYPH[kind], dim && "opacity-60 grayscale", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      {app ? <BrandIcon name={app} size={glyph} /> : <KindIcon kind={kind} size={glyph} />}
    </span>
  );
}
