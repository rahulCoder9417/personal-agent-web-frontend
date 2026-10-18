"use client";

import { ApiError, type Approval, type SkipScope } from "@/lib/api/client";
import { useCreateSkipRule, useDecideApproval } from "@/lib/api/hooks";
import { cn, formatDateTime, titleCase } from "@/lib/format";
import { toast, toastError } from "../toast";
import { Button } from "../ui";
import { ApprovalDetailsFold, ApprovalFacts, DecidedLine, RunResult, approvalView } from "./approval-parts";
import { ApprovalIcon, CARD_EDGE } from "./approval-list";
import { SkipPicker } from "./skip-picker";
import { approvalOutcome, approvalReasonOf, ownAction, ruleSavedToast, ruleScopeLine, type SettledStatus } from "@/lib/approvals";

type Decision = "approve" | "reject";

const STATUS_LABEL: Record<Approval["status"], string> = {
  pending: "Needs your OK",
  approved: "Approved",
  rejected: "Denied",
  expired: "Expired",
  replaced: "Replaced",
  auto_approved: "Auto-approved",
};

function settledLine(approval: Approval): string {
  if (approval.status === "pending") return `Expires ${formatDateTime(approval.expiresAt)}`;
  if (approval.status === "expired") return `Expired ${formatDateTime(approval.expiresAt)}`;
  // Its decidedAt is the user's yes, if any, not when Tex asked again.
  if (approval.status === "replaced") return STATUS_LABEL.replaced;
  if (approval.status === "auto_approved") return `Ran ${formatDateTime(approval.decidedAt ?? approval.createdAt)}, without asking`;
  const when = approval.decidedAt ? ` ${formatDateTime(approval.decidedAt)}` : "";
  return `${STATUS_LABEL[approval.status]}${when}`;
}

/**
 * Everything about one approval, and the two buttons while it is still waiting. An auto-approved one
 * says which skip rule let it run and how it went (`onShowRules`: open the Skip rules list).
 */
export function ApprovalDetail({
  approval,
  onDecided,
  onShowRules,
}: {
  approval: Approval;
  onDecided: (decision: Decision) => void;
  onShowRules?: () => void;
}) {
  const decide = useDecideApproval();
  const createRule = useCreateSkipRule();
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

  // "Don't ask again": the rule first, then the yes. A rule that can't be saved leaves this as it was.
  const skipAndApprove = (scope: SkipScope) =>
    createRule.mutate(
      { approvalId: approval.id, scope },
      {
        onSuccess: (rule) =>
          decide.mutate(
            { approvalId: approval.id, decision: "approve" },
            {
              onSuccess: () => {
                toast(ruleSavedToast(rule));
                onDecided("approve");
              },
              onError: (error) => toastError("The rule is saved, but this one couldn’t be approved", error),
            },
          ),
        onError: (error) => toastError("Couldn’t save the rule", error),
      },
    );

  const { why, forcePush } = approvalView(approval);
  const auto = approval.status === "auto_approved";
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

      <ApprovalFacts approval={approval} className="-mt-1" />

      {/* There is room on this page, so the exact command or fields start unfolded. */}
      <ApprovalDetailsFold approval={approval} open className="-mt-1" />

      {pending ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" pending={choosing === "approve"} disabled={decide.isPending || createRule.isPending} onClick={() => run("approve")}>
              Approve
            </Button>
            <Button variant="secondary" pending={choosing === "reject"} disabled={decide.isPending || createRule.isPending} onClick={() => run("reject")}>
              Deny
            </Button>
          </div>
          <p className="-mt-2 text-center text-[12px] text-muted">The same buttons are in your chat.</p>
          {approval.skip && <SkipPicker offer={approval.skip} busy={createRule.isPending || decide.isPending} onConfirm={skipAndApprove} className="-mt-1" />}
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <DecidedLine approval={approval} />
          {auto && approval.skipRule && approval.action && (
            <p className="text-[12.5px] text-fg-2 [overflow-wrap:anywhere]">
              <span className="text-muted">Your rule: </span>
              {ruleScopeLine({ action: approval.action, scope: approval.skipRule.scope, recipients: approval.skipRule.recipients })}
              {onShowRules && (
                <>
                  <span aria-hidden className="text-muted"> · </span>
                  <button type="button" onClick={onShowRules} className="font-medium text-accent hover:underline">
                    See your skip rules
                  </button>
                </>
              )}
            </p>
          )}
          {approval.run ? <RunResult run={approval.run} className="mt-1" /> : <p className="text-[12.5px] text-muted">{approvalOutcome(approval.status as SettledStatus)}</p>}
        </div>
      )}

      <p className="text-center text-[12px] text-muted tabular-nums">
        {auto ? settledLine(approval) : `Asked ${formatDateTime(approval.createdAt)} · ${settledLine(approval)}`}
      </p>
    </article>
  );
}
