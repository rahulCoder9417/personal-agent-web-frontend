"use client";

// The settings beside the canvas, for the box that is open: its mark, its name and whether its app
// is connected at the top; its form (the existing ones: the trigger's, a step's, Tex's instruction,
// the results'); and at the foot "Remove step" and what it costs.

import type { ReactNode } from "react";
import type { AppHealth } from "@/lib/automation-apps";
import type { FlowDetail } from "@/lib/automation-flow";
import { cn } from "@/lib/format";
import { TrashIcon } from "../icons";
import { AppLogo, Btn, Chip, Dot, T2, T3 } from "./parts";

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

export function InspectorHeader({ logo, iconUrl, label, title, status }: { logo: string; iconUrl?: string | null; label: string; title: string; status?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <AppLogo slug={logo} size={40} iconUrl={iconUrl} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn(T3, "text-muted")}>{label}</span>
        <h2 className={cn(T2, "font-semibold break-words")}>{title}</h2>
      </span>
      {status}
    </div>
  );
}

/** "Remove step" (grey, with a bin, red only under the pointer) and what the box costs. */
export function InspectorFooter({ onRemove, removeLabel = "Remove step", note }: { onRemove?: () => void; removeLabel?: string; note?: string | null }) {
  if (!onRemove && !note) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
      {onRemove ? (
        <Btn size="sm" variant="remove" onClick={onRemove}>
          <TrashIcon size={14} />
          {removeLabel}
        </Btn>
      ) : (
        <span />
      )}
      {note && <span className={cn(T3, "text-right text-muted")}>{note}</span>}
    </div>
  );
}

/** A section of a panel: a heading in the body size, and its fields. */
export function PanelSection({ title, hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {(title || hint) && (
        <div className="flex flex-col gap-1">
          {title && <h3 className={cn(T2, "font-medium")}>{title}</h3>}
          {hint && <p className={cn(T3, "text-muted")}>{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** What a box says when it can't be changed here: each detail, as a label and its value. */
export function Details({ details, note }: { details: readonly FlowDetail[]; note?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        {details.map((detail) => (
          <div key={detail.label} className="flex flex-col gap-1">
            <dt className={cn(T3, "text-muted")}>{detail.label}</dt>
            <dd className={cn(T2, "break-words whitespace-pre-line text-fg")}>{detail.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className={cn(T3, "rounded-xl bg-bg px-4 py-3 text-fg-2")}>{note}</p>}
    </div>
  );
}
