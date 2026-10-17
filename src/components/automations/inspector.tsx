"use client";

// The settings beside the canvas, for the box that is open, in three parts. At the top, staying put
// while the rest scrolls (`InspectorHeader`): the box's mark on its kind's coloured tile, what kind
// of box it is ("TEX STEP", "READS FROM GITHUB"), its name, and whether its app is connected. Then
// its form in sections (`InspectorBody`: the existing forms of the trigger, a step, Tex's
// instruction, the results), 24px apart. At the foot, also staying put (`InspectorFooter`):
// "Remove step" and what it costs.

import type { ReactNode } from "react";
import type { AppHealth } from "@/lib/automation-apps";
import type { FlowDetail } from "@/lib/automation-flow";
import { cn } from "@/lib/format";
import { TrashIcon } from "../icons";
import { FormSection, LABEL, NOTE } from "./editor-forms";
import { NodeTile, type NodeKind } from "./kind-icon";
import { Btn, Chip, Dot, T2, T3 } from "./parts";

/** Whether the box's app works, as a chip beside its name. Nothing for Tex, a schedule or the chat. */
export function HealthChip({ health }: { health: AppHealth | undefined }) {
  if (!health || health === "unknown") return null;
  if (health === "ok")
    return (
      <Chip tone="ok">
        <Dot tone="ok" size={6} />
        Connected
      </Chip>
    );
  return <Chip tone="warn">{health === "reconnect" ? "Reconnect" : health === "plan" ? "Not on your plan" : "Not connected"}</Chip>;
}

/** The top of the settings: the box's tile, its kind in its colour, its name, and how its app stands. */
export function InspectorHeader({ kind, logo, iconUrl, label, title, status }: { kind: NodeKind; logo: string; iconUrl?: string | null; label: string; title: string; status?: ReactNode }) {
  return (
    <header data-kind={kind} className="sticky top-0 z-10 flex min-h-[72px] shrink-0 items-center gap-3 border-b border-fg/10 bg-surface px-4 pt-4 pb-4 md:px-6">
      <NodeTile kind={kind} logo={logo} iconUrl={iconUrl} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn(T3, "truncate font-semibold tracking-[0.04em] text-[var(--k-ink)] uppercase")}>{label}</span>
        <h2 className={cn(T2, "line-clamp-2 font-semibold break-words")}>{title}</h2>
        {status && <span className="flex pt-1">{status}</span>}
      </span>
    </header>
  );
}

/** The settings' sections, 24px apart, 24px in from the sides (16px on a phone). */
export function InspectorBody({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-6">{children}</div>;
}

/** "Remove step" (grey, with a bin, red only under the pointer) and what the box costs, at the foot. */
export function InspectorFooter({ onRemove, removeLabel = "Remove step", note }: { onRemove?: () => void; removeLabel?: string; note?: string | null }) {
  if (!onRemove && !note) return null;
  return (
    <footer className="sticky bottom-0 z-10 flex min-h-[68px] items-center justify-between gap-3 border-t border-line bg-surface px-4 py-4 md:px-6">
      {onRemove ? (
        <Btn variant="remove" onClick={onRemove} className="shadow-[inset_0_0_0_1px_var(--line-strong)]">
          <TrashIcon size={14} />
          {removeLabel}
        </Btn>
      ) : (
        <span />
      )}
      {note && <span className={cn(T3, "text-right text-muted")}>{note}</span>}
    </footer>
  );
}

/** A section of a panel: a small uppercase heading, and its fields. */
export function PanelSection({ title, hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <FormSection title={title}>
      {hint && <p className={cn(T3, "-mt-2 text-muted")}>{hint}</p>}
      {children}
    </FormSection>
  );
}

/** What a box says when it can't be changed here: each detail, as a label and its value. */
export function Details({ details, note }: { details: readonly FlowDetail[]; note?: string }) {
  return (
    <FormSection title="Details">
      <dl className="flex flex-col gap-4">
        {details.map((detail) => (
          <div key={detail.label} className="flex flex-col gap-1.5">
            <dt className={LABEL}>{detail.label}</dt>
            <dd className={cn(T2, "break-words whitespace-pre-line text-fg-2")}>{detail.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className={NOTE}>{note}</p>}
    </FormSection>
  );
}
