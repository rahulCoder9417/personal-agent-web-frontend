"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, type Approval, type ApprovalStatus } from "@/lib/api/client";
import { findCachedApproval, useDecideApproval } from "@/lib/api/hooks";
import { approvalReason, splitDetails } from "@/lib/approvals";
import { cn, formatTimeLeft, titleCase } from "@/lib/format";
import { AppIcon } from "../brand-icon";
import { CheckIcon, CloseIcon } from "../icons";
import { Button, InlineError } from "../ui";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected", "expired"];

/** There is no "get one approval" endpoint, so look through the lists, newest state first. */
function useApproval(approvalId: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["approval", approvalId],
    queryFn: async (): Promise<Approval | null> => {
      for (const status of STATUSES) {
        const page = await unwrap(api.GET("/v1/approvals", { params: { query: { status, limit: 50 } } }));
        const hit = page.items.find((a) => a.id === approvalId);
        if (hit) return hit;
      }
      return null;
    },
    initialData: () => findCachedApproval(qc, approvalId),
    staleTime: 10_000,
  });
}

const RESULT: Record<Exclude<ApprovalStatus, "pending">, { text: string; className: string; done: boolean }> = {
  approved: { text: "You approved this", className: "text-success", done: true },
  rejected: { text: "You rejected this", className: "text-danger", done: false },
  expired: { text: "This expired before it was answered", className: "text-muted", done: false },
};

/** The Approve / Reject card that sits in the thread where Tex stopped to ask. */
export function ApprovalCard({ approvalId, fallbackText }: { approvalId: string; fallbackText?: string }) {
  const qc = useQueryClient();
  const { data: approval, isLoading } = useApproval(approvalId);
  const decide = useDecideApproval();

  if (isLoading) return <div aria-hidden className="h-[150px] w-full max-w-[480px] animate-pulse rounded-2xl bg-surface-2" />;
  // The approval can't be found (very old, or already cleaned up): show the message as plain text.
  if (!approval) {
    return fallbackText ? (
      <div className="max-w-[560px] rounded-[18px] rounded-bl-[6px] bg-surface-2 px-4 py-2.5 text-[14.5px] leading-[1.45] break-words whitespace-pre-wrap">{fallbackText}</div>
    ) : null;
  }

  const reason = approvalReason(approval.action);
  const { preview, fields } = splitDetails(approval.details);
  const pending = approval.status === "pending";
  const result = pending ? null : RESULT[approval.status as keyof typeof RESULT];
  const submit = (decision: "approve" | "reject") =>
    decide.mutate(
      { approvalId, decision },
      {
        onSuccess: (next) => qc.setQueryData(["approval", approvalId], next),
        // Someone (or the chat app) decided first: show what happened.
        onError: () => qc.invalidateQueries({ queryKey: ["approval", approvalId] }),
      },
    );

  return (
    <div
      className={cn(
        "flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-surface",
        pending ? "shadow-[0_0_0_1px_var(--accent),0_10px_30px_-14px_rgb(51_85_245/0.45)]" : "shadow-[0_0_0_1px_var(--line)]",
      )}
    >
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <AppIcon name={approval.app ?? "web"} size={36} />
        <div className="flex min-w-0 flex-col">
          <span className={cn("text-[12px] font-semibold", pending ? "text-accent" : "text-muted")}>
            {pending ? "Needs your OK" : approval.app ? titleCase(approval.app) : "Approval"}
            <span className="font-normal text-muted">
              {pending ? ` · ${reason.label.toLowerCase()}` : ""}
            </span>
          </span>
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{approval.summary}</span>
        </div>
      </div>

      {(fields.length > 0 || preview) && (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-xl bg-surface-2 px-3.5 py-3">
          {fields.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              {fields.slice(0, 4).map((field) => (
                <div key={field.key} className="contents">
                  <dt className="text-muted">{field.label}</dt>
                  <dd className="truncate">{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {preview && <p className={cn("text-[13.5px] leading-relaxed text-fg-2", fields.length > 0 && "border-t border-line pt-2")}>{preview}</p>}
        </div>
      )}

      {pending ? (
        <div className="flex items-center gap-2 px-4 pb-3.5">
          <Button variant="primary" className="flex-1" onClick={() => submit("approve")} pending={decide.isPending && decide.variables?.decision === "approve"}>
            Approve
          </Button>
          <Button className="flex-1" onClick={() => submit("reject")} disabled={decide.isPending}>
            Reject
          </Button>
          <span className="pl-1 text-[12px] whitespace-nowrap text-muted tabular-nums">{formatTimeLeft(approval.expiresAt)}</span>
        </div>
      ) : (
        result && (
          <p className={cn("flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[13px] font-medium", result.className)}>
            {result.done ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
            {result.text}
          </p>
        )
      )}
      <InlineError error={decide.error} className="px-4 pb-3" />
    </div>
  );
}
