"use client";

import type { Approval } from "@/lib/api/client";
import { cn, formatDate, formatTimeLeft } from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { ApprovalsIcon } from "../icons";
import { IconTile } from "../ui";
import { approvalReason, type ApprovalReason } from "@/lib/approvals";

export const REASON_TEXT: Record<ApprovalReason["tone"], string> = {
  info: "text-accent-dark",
  danger: "text-danger",
  neutral: "text-muted",
};

export function ApprovalIcon({ app, size = 18 }: { app?: string | null; size?: number }) {
  return app ? <BrandIcon name={app} size={size} /> : <ApprovalsIcon size={size} className="text-nav" />;
}

/** Right-hand note on a list row: time left while pending, otherwise the day it was settled. */
function rowWhen(approval: Approval): string {
  if (approval.status === "pending") return formatTimeLeft(approval.expiresAt);
  return formatDate(approval.status === "expired" ? approval.expiresAt : (approval.decidedAt ?? approval.createdAt));
}

/** The master list: one button per approval, the selected one outlined. */
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
        const reason = approvalReason(approval.action);
        return (
          <li key={approval.id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(approval.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                on ? "border-fg-2 bg-surface" : "border-line hover:border-line-strong hover:bg-surface/60",
              )}
            >
              <IconTile size={38}>
                <ApprovalIcon app={approval.app} />
              </IconTile>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-semibold">{approval.summary}</span>
                <span className={cn("text-[12.5px]", REASON_TEXT[reason.tone])}>{reason.label}</span>
              </span>
              <span className="shrink-0 text-[12px] text-muted">{rowWhen(approval)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
