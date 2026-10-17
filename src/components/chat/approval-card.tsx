"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, type Approval, type ApprovalStatus } from "@/lib/api/client";
import { findCachedApproval, useDecideApproval } from "@/lib/api/hooks";
import { webApprovalLine } from "@/lib/approvals";
import { noteAnswered } from "@/lib/chat-thread";
import { cn, formatTimeLeft } from "@/lib/format";
import { ApprovalDetailsFold, ApprovalTitle, DecidedLine, approvalView } from "../approvals/approval-parts";
import { AppIcon } from "../brand-icon";
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

/** The Approve / Deny card that sits in the thread, under Tex's question, where Tex stopped to ask. */
export function ApprovalCard({ approvalId, fallbackText }: { approvalId: string; fallbackText?: string }) {
  const qc = useQueryClient();
  const { data: approval, isLoading } = useApproval(approvalId);
  const decide = useDecideApproval();

  if (isLoading) return <div aria-hidden className="h-[150px] w-full max-w-[480px] animate-pulse rounded-2xl bg-accent-soft" />;
  // The approval can't be found (very old, or already cleaned up): show the message as any other of Tex's.
  if (!approval) return fallbackText ? <AgentBubble text={fallbackText} /> : null;

  const { forcePush, why, hasDetails } = approvalView(approval);
  const pending = approval.status === "pending";
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

  // Answered: the card shrinks to one tinted line, "You approved – <what>".
  if (!pending) return <DecidedLine approval={approval} className="max-w-[480px] px-4" />;

  return (
    <div className="flex w-full max-w-[480px] flex-col gap-4 rounded-2xl bg-accent-soft p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-lg bg-surface p-0.5">
          <AppIcon name={approval.app ?? "web"} size={32} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-semibold text-accent">Needs your OK</span>
          <ApprovalTitle summary={approval.summary} />
          {why && <p className={cn("text-[13.5px] leading-normal", forcePush ? "text-danger" : "text-fg-2")}>{why}</p>}
        </div>
      </div>

      {hasDetails && <ApprovalDetailsFold approval={approval} className="-mt-1" />}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={() => submit("approve")} pending={decide.isPending && decide.variables?.decision === "approve"}>
          Approve
        </Button>
        <Button onClick={() => submit("reject")} disabled={decide.isPending}>
          Deny
        </Button>
      </div>
      <p className="-mt-2 text-center text-[12px] text-muted tabular-nums">{formatTimeLeft(approval.expiresAt)}</p>
      <InlineError error={decide.error} />
    </div>
  );
}

/**
 * Tex stopped to ask (a message carrying an approval): one short line above, then the Approve / Deny card.
 * The long wording stays on the message for Telegram and WhatsApp; the card already says what and why, so
 * the web does not repeat it (see `webApprovalLine`). An older ask ("Approval needed: …") shows the card alone.
 */
export function ApprovalQuestion({ text, approvalId }: { text: string; approvalId: string }) {
  const question = webApprovalLine(text);
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      {question && <AgentBubble text={question} />}
      <ApprovalCard approvalId={approvalId} fallbackText={question ? undefined : text} />
    </div>
  );
}
