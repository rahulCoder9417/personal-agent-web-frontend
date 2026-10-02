"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/format";

/**
 * A quiet text button that asks once more before doing something that removes things:
 * the first click swaps it for "confirm / cancel", and it settles back if left alone.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  ariaLabel,
  onConfirm,
  pending,
  className,
}: {
  label: string;
  confirmLabel: string;
  /** Says what is being removed, for screen readers ("Disconnect Gmail work@acme.com"). */
  ariaLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed || pending) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed, pending]);

  if (!armed && !pending) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setArmed(true)}
        className={cn("h-7 shrink-0 rounded px-1 text-[12.5px] text-muted transition-colors hover:text-danger", className)}
      >
        {label}
      </button>
    );
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2", className)}>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onConfirm}
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-danger-soft px-2.5 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger hover:text-white disabled:pointer-events-none"
      >
        {pending && <Spinner size={12} />}
        {confirmLabel}
      </button>
      {!pending && (
        <button type="button" onClick={() => setArmed(false)} className="h-7 rounded px-1 text-[12.5px] text-muted hover:text-fg">
          Cancel
        </button>
      )}
    </span>
  );
}
