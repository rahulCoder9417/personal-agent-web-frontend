"use client";

import { ApiError, type Approval } from "@/lib/api/client";
import { useDecideApproval } from "@/lib/api/hooks";
import { cn, formatDateTime, titleCase } from "@/lib/format";
import { toastError } from "../toast";
import { Button } from "../ui";
import { ApprovalDetailsFold, DecidedLine, approvalView } from "./approval-parts";
import { ApprovalIcon, CARD_EDGE } from "./approval-list";
import { approvalOutcome, approvalReasonOf, ownAction, type SettledStatus } from "@/lib/approvals";

type Decision = "approve" | "reject";

const STATUS_LABEL: Record<Approval["status"], string> = {
  pending: "Needs your OK",
  approved: "Approved",
  rejected: "Denied",
  expired: "Expired",
  replaced: "Replaced",
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
  const reason = approvalReasonOf(approval);
  // One of the agent's own actions (a command, a push, a job run again): shown as it is, not as fields.
  const own = ownAction(approval);
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

  const { why, forcePush } = approvalView(approval);
  // The kind of ask ("Runs a command") in words, quiet, beside the app when there is one.
  const meta = [reason.label, !own && approval.app ? titleCase(approval.app) : null, !own ? approval.action : null].filter(Boolean).join(" · ");

  return (
    <article aria-label={approval.summary} className={cn("flex w-full max-w-[640px] flex-col gap-4 rounded-2xl bg-accent-soft p-4 sm:p-5", CARD_EDGE)}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-lg bg-surface p-0.5">
          <ApprovalIcon app={approval.app} size={32} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-semibold text-accent">{STATUS_LABEL[approval.status]}</span>
          <h2 className="line-clamp-2 text-[15px] leading-[1.35] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere] break-words">{approval.summary}</h2>
          {pending && why && <p className={cn("text-[13.5px] leading-normal", forcePush ? "text-danger" : "text-fg-2")}>{why}</p>}
          <p className="truncate text-[12px] text-muted">{meta}</p>
        </div>
      </div>

      {/* There is room on this page, so the exact command or fields start unfolded. */}
      <ApprovalDetailsFold approval={approval} open className="-mt-1" />

      {pending ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" pending={choosing === "approve"} disabled={decide.isPending} onClick={() => run("approve")}>
              Approve
            </Button>
            <Button variant="secondary" pending={choosing === "reject"} disabled={decide.isPending} onClick={() => run("reject")}>
              Deny
            </Button>
          </div>
          <p className="-mt-2 text-center text-[12px] text-muted">The same buttons are in your chat.</p>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <DecidedLine approval={approval} />
          <p className="text-[12.5px] text-muted">{approvalOutcome(approval.status as SettledStatus)}</p>
        </div>
      )}

      <p className="text-center text-[12px] text-muted tabular-nums">
        Asked {formatDateTime(approval.createdAt)} · {settledLine(approval)}
      </p>
    </article>
  );
}
