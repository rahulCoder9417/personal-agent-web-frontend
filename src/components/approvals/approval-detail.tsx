"use client";

import { ApiError, type Approval } from "@/lib/api/client";
import { useDecideApproval } from "@/lib/api/hooks";
import { cn, formatDateTime, titleCase } from "@/lib/format";
import { READING } from "../page";
import { toastError } from "../toast";
import { Button, IconTile, Pill, type PillTone } from "../ui";
import { ApprovalIcon } from "./approval-list";
import { approvalOutcome, approvalReason, splitDetails, type ApprovalReason, type SettledStatus } from "@/lib/approvals";

type Decision = "approve" | "reject";

const REASON_CHIP: Record<ApprovalReason["tone"], string> = {
  info: "bg-accent-soft text-accent-dark",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-fg-2",
};

const STATUS_LABEL: Record<Approval["status"], string> = {
  pending: "Needs your OK",
  approved: "Approved",
  rejected: "Denied",
  expired: "Expired",
  replaced: "Replaced",
};

const STATUS_PILL: Record<SettledStatus, PillTone> = {
  approved: "done",
  rejected: "danger",
  expired: "muted",
  replaced: "muted",
};

function settledLine(approval: Approval): string {
  if (approval.status === "pending") return `Expires ${formatDateTime(approval.expiresAt)}`;
  if (approval.status === "expired") return `Expired ${formatDateTime(approval.expiresAt)}`;
  // Its decidedAt is the user's yes, if any, not when Tex asked again.
  if (approval.status === "replaced") return STATUS_LABEL.replaced;
  const when = approval.decidedAt ? ` ${formatDateTime(approval.decidedAt)}` : "";
  return `${STATUS_LABEL[approval.status]}${when}`;
}

/** Everything about one approval, and the two buttons while it is still waiting. */
export function ApprovalDetail({ approval, onDecided }: { approval: Approval; onDecided: (decision: Decision) => void }) {
  const decide = useDecideApproval();
  const reason = approvalReason(approval.action);
  const { preview, fields } = splitDetails(approval.details);
  const pending = approval.status === "pending";
  const choosing = decide.isPending ? decide.variables?.decision : undefined;

  const run = (decision: Decision) =>
    decide.mutate(
      { approvalId: approval.id, decision },
      {
        onSuccess: () => onDecided(decision),
        onError: (error) => {
          const title = decision === "approve" ? "Couldn’t approve that" : "Couldn’t reject that";
          // 409: someone (or the clock) got there first. The list has been asked for again.
          const settled = error instanceof ApiError && error.status === 409;
          toastError(title, settled ? "This was already decided or has expired. The list is up to date now." : error);
        },
      },
    );

  return (
    // The card takes the pane's whole width; what is read (the message itself) keeps a comfortable line.
    <article aria-label={approval.summary} className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-6">
      <div className="flex items-center gap-3.5">
        <IconTile size={46}>
          <ApprovalIcon app={approval.app} size={22} />
        </IconTile>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-[7px] text-[11.5px] text-muted">
            <span aria-hidden className="h-3 w-1 bg-accent" />
            {STATUS_LABEL[approval.status]}
          </p>
          <h2 className="text-[18px] leading-snug font-semibold tracking-[-0.01em]">{approval.summary}</h2>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-medium", REASON_CHIP[reason.tone])}>{reason.label}</span>
        {(approval.app || approval.action) && (
          <span className="text-[12px] text-muted">
            {[approval.app && titleCase(approval.app), approval.action].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {fields.length > 0 && (
        <dl className="flex flex-col gap-2">
          {fields.map((field) => (
            <div key={field.key} className="flex gap-4">
              <dt className="w-[84px] shrink-0 text-[12px] leading-5 text-muted">{field.label}</dt>
              <dd className="min-w-0 break-words">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {preview && (
        <div className="rounded-xl bg-surface-2 px-4 py-3.5">
          <p className={cn("text-[14.5px] leading-relaxed whitespace-pre-wrap text-fg-2", READING)}>{preview}</p>
        </div>
      )}

      {pending ? (
        // The two buttons keep a size a thumb or a pointer can aim at, however wide the card is.
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <div className="grid w-full max-w-[440px] grid-cols-2 gap-2.5">
            <Button size="lg" variant="secondary" pending={choosing === "reject"} disabled={decide.isPending} onClick={() => run("reject")}>
              Deny
            </Button>
            <Button size="lg" variant="primary" pending={choosing === "approve"} disabled={decide.isPending} onClick={() => run("approve")}>
              Approve
            </Button>
          </div>
          <p className="text-[12.5px] text-muted">The same buttons are waiting in your chat. Either place works.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone={STATUS_PILL[approval.status as SettledStatus]} className="px-3 text-[12.5px]">
            {STATUS_LABEL[approval.status]}
          </Pill>
          <span className="text-[13px] text-muted">{approvalOutcome(approval.status as SettledStatus)}</span>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line pt-4 text-[12px] text-muted">
        <span>Asked {formatDateTime(approval.createdAt)}</span>
        <span>{settledLine(approval)}</span>
      </div>
    </article>
  );
}
