"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, type Approval, type ApprovalStatus } from "@/lib/api/client";
import { findCachedApproval, useDecideApproval } from "@/lib/api/hooks";
import { APPROVAL_RESULT, approvalQuestion, approvalReason, splitDetails, type SettledStatus } from "@/lib/approvals";
import { noteAnswered } from "@/lib/chat-thread";
import { cn, formatTimeLeft, titleCase } from "@/lib/format";
import { AppIcon } from "../brand-icon";
import { CheckIcon, CloseIcon } from "../icons";
import { Button, InlineError } from "../ui";
import { AgentBubble } from "./agent-bubble";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected", "expired", "replaced"];

/**
 * One approval, kept fresh by the live stream (`approval.created`, `approval.resolved`). There is no
 * "get one approval" endpoint, so look through the lists, newest state first. Null asks for nothing.
 */
export function useApproval(approvalId: string | null) {
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
    initialData: () => (approvalId ? findCachedApproval(qc, approvalId) : undefined),
    staleTime: 10_000,
    enabled: approvalId !== null,
  });
}

const TONE_CLASS = { success: "text-success", danger: "text-danger", muted: "text-muted" } as const;

/** The Approve / Deny card that sits in the thread, under Tex's question, where Tex stopped to ask. */
export function ApprovalCard({ approvalId, fallbackText }: { approvalId: string; fallbackText?: string }) {
  const qc = useQueryClient();
  const { data: approval, isLoading } = useApproval(approvalId);
  const decide = useDecideApproval();

  if (isLoading) return <div aria-hidden className="h-[150px] w-full max-w-[480px] animate-pulse rounded-2xl bg-surface-2" />;
  // The approval can't be found (very old, or already cleaned up): show the message as any other of Tex's.
  if (!approval) return fallbackText ? <AgentBubble text={fallbackText} /> : null;

  const reason = approvalReason(approval.action);
  const { preview, fields } = splitDetails(approval.details);
  const pending = approval.status === "pending";
  const result = pending ? null : APPROVAL_RESULT[approval.status as SettledStatus];
  const submit = (decision: "approve" | "reject") =>
    decide.mutate(
      { approvalId, decision },
      {
        onSuccess: (next) => {
          qc.setQueryData(["approval", approvalId], next);
          // Tex picks the answer up at once: the thread shows it at work while it wakes for it.
          noteAnswered(approvalId);
        },
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
            Deny
          </Button>
          <span className="pl-1 text-[12px] whitespace-nowrap text-muted tabular-nums">{formatTimeLeft(approval.expiresAt)}</span>
        </div>
      ) : (
        result && (
          <p className={cn("flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[13px] font-medium", TONE_CLASS[result.tone])}>
            {result.icon === "check" && <CheckIcon size={14} />}
            {result.icon === "close" && <CloseIcon size={14} />}
            {result.text}
          </p>
        )
      )}
      <InlineError error={decide.error} className="px-4 pb-3" />
    </div>
  );
}

/**
 * Tex stopped to ask (a message carrying an approval): what it wants to do, in its own words ("I'd
 * like to send an email to … Approve or Deny below."), with the Approve / Deny card right under it.
 * An older ask ("Approval needed: …") only repeated the card's summary, so the card shows alone.
 */
export function ApprovalQuestion({ text, approvalId }: { text: string; approvalId: string }) {
  const question = approvalQuestion(text);
  return (
    <>
      {question && <AgentBubble text={question} />}
      <ApprovalCard approvalId={approvalId} fallbackText={question ? undefined : text} />
    </>
  );
}
