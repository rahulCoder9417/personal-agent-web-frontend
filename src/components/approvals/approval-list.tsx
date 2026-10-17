"use client";

import type { Approval } from "@/lib/api/client";
import { cn, formatDate, formatTimeLeft } from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { ApprovalsIcon } from "../icons";
import { IconTile } from "../ui";
import { approvalReasonOf } from "@/lib/approvals";

export function ApprovalIcon({ app, size = 18 }: { app?: string | null; size?: number }) {
  return app ? <BrandIcon name={app} size={size} /> : <ApprovalsIcon size={size} className="text-nav" />;
}

/** Right-hand note on a list row: time left while pending, otherwise the day it was settled. */
function rowWhen(approval: Approval): string {
  if (approval.status === "pending") return formatTimeLeft(approval.expiresAt);
  return formatDate(approval.status === "expired" ? approval.expiresAt : (approval.decidedAt ?? approval.createdAt));
}

/** Same neutral edge for every card and for the detail panel (the app's `--line` is warm, so this is the ink colour at 10%). */
export const CARD_EDGE = "border border-fg/10";
export const CARD_ON = "border-accent/25 bg-accent-soft";
export const CARD_OFF = "bg-surface hover:bg-surface-2";

/** The master list: one button per approval, the selected one filled softly. */
export function ApprovalList({
  approvals,
  selectedId,
  onSelect,
}: {
  approvals: Approval[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {approvals.map((approval) => {
        const on = approval.id === selectedId;
        const kind = approvalReasonOf(approval).label;
        return (
          <li key={approval.id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(approval.id)}
              className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors", CARD_EDGE, on ? CARD_ON : CARD_OFF)}
            >
              <IconTile size={36} className={on ? "bg-surface" : undefined}>
                <ApprovalIcon app={approval.app} />
              </IconTile>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-semibold">{approval.summary}</span>
                <span className="truncate text-[12.5px] text-muted">
                  {kind}
                  <span aria-hidden> · </span>
                  {rowWhen(approval)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
