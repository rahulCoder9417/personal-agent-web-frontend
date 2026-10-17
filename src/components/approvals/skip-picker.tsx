"use client";

import { useState } from "react";
import type { SkipOffer, SkipScope } from "@/lib/api/client";
import { SKIP_CONFIRM, SKIP_LINK, SKIP_NEVER, skipChoices } from "@/lib/approvals";
import { cn } from "@/lib/format";
import { RadioCards } from "../segmented-control";
import { Button } from "../ui";

/**
 * "Don't ask again for this…" under a waiting card: a quiet link that opens a small choice, "Only to
 * <its recipients>" (the default) or "Anyone" (with a one-line warning). Confirming saves the rule and
 * approves this card (the caller does both, in that order). Only drawn when the server offers it
 * (`approval.skip`): never for deleting, paying, merging or Tex's own commands and pushes.
 * `open`: unfolded to begin with (tests and screenshots).
 */
export function SkipPicker({
  offer,
  busy,
  onConfirm,
  open: startOpen = false,
  className,
}: {
  offer: SkipOffer;
  busy: boolean;
  onConfirm: (scope: SkipScope) => void;
  open?: boolean;
  className?: string;
}) {
  const choices = skipChoices(offer);
  const [open, setOpen] = useState(startOpen);
  const [scope, setScope] = useState<SkipScope>(choices[0].scope);
  const picked = choices.find((choice) => choice.scope === scope) ?? choices[0];

  if (!open)
    return (
      <button
        type="button"
        aria-expanded={false}
        disabled={busy}
        onClick={() => setOpen(true)}
        className={cn("self-center rounded px-1 text-[12.5px] text-muted underline-offset-2 transition-colors hover:text-fg hover:underline disabled:opacity-50", className)}
      >
        {SKIP_LINK}
      </button>
    );

  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl bg-surface px-3.5 py-3", className)}>
      <p className="text-[13px] font-semibold">Don’t ask again: {offer.actionName.toLowerCase()}</p>
      <RadioCards
        label={`Don’t ask again for ${offer.actionName.toLowerCase()}`}
        options={choices.map((choice) => ({ value: choice.scope, label: choice.label, description: choice.hint }))}
        value={scope}
        onChange={setScope}
      />
      {picked.warning && <p className="text-[12.5px] leading-snug text-danger">{picked.warning}</p>}
      {/* Full width: on a phone the words don't fit beside Cancel. */}
      <Button variant="primary" size="sm" className="w-full" pending={busy} onClick={() => onConfirm(scope)}>
        {SKIP_CONFIRM}
      </Button>
      <div className="-mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted">{SKIP_NEVER}</p>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
