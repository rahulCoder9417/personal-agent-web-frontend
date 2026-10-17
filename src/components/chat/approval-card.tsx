"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, type Approval, type ApprovalStatus } from "@/lib/api/client";
import { findCachedApproval, useDecideApproval } from "@/lib/api/hooks";
import { APPROVAL_RESULT, approvalReasonOf, ownAction, splitDetails, webApprovalLine, type SettledStatus } from "@/lib/approvals";
import { noteAnswered } from "@/lib/chat-thread";
import { cn, formatTimeLeft } from "@/lib/format";
import { OwnActionDetails } from "../approvals/own-action";
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

  if (isLoading) return <div aria-hidden className="h-[150px] w-full max-w-[480px] animate-pulse rounded-2xl bg-accent-soft" />;
  // The approval can't be found (very old, or already cleaned up): show the message as any other of Tex's.
  if (!approval) return fallbackText ? <AgentBubble text={fallbackText} /> : null;

  const reason = approvalReasonOf(approval);
  // One of the agent's own actions (a command, a push, a job run again): shown as it is, not as fields.
  const own = ownAction(approval);
  const { preview, fields } = own ? { preview: null, fields: [] } : splitDetails(approval.details);
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

  const title = <span className="line-clamp-2 text-[15px] leading-[1.35] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">{approval.summary}</span>;

  // Answered: the card shrinks to one tinted line, "You approved – <what>".
  if (!pending) {
    if (!result) return null;
    const tint = result.tone === "success" ? "bg-success-soft" : result.tone === "danger" ? "bg-danger-soft" : "bg-surface-2";
    return (
      <div className={cn("flex w-full max-w-[480px] items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] leading-5 font-medium", tint, TONE_CLASS[result.tone])}>
        {result.icon === "check" && <CheckIcon size={14} className="shrink-0" />}
        {result.icon === "close" && <CloseIcon size={14} className="shrink-0" />}
        <span className="min-w-0 truncate">
          {result.text}
          <span className="font-normal text-muted"> – {approval.summary}</span>
        </span>
      </div>
    );
  }

  // One short "why" line. The exact details stay behind the toggle below.
  const forcePush = own?.kind === "git_push" && own.force;
  const why =
    own?.kind === "command" && own.why
      ? `It needs your OK because ${own.why}.`
      : forcePush
        ? "A force push rewrites the branch’s history."
        : reason.label === "Needs your OK"
          ? null
          : `${reason.label}.`;
  const hasDetails = own !== null || fields.length > 0 || preview !== null;
  const toggle = own?.kind === "command" ? (own.tool === "Bash" ? "Show the exact command" : "Show the file") : "Show the details";

  return (
    <div className="flex w-full max-w-[480px] flex-col gap-4 rounded-2xl bg-accent-soft p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-lg bg-surface p-0.5">
          <AppIcon name={approval.app ?? "web"} size={32} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-semibold text-accent">Needs your OK</span>
          {title}
          {why && <p className={cn("text-[13.5px] leading-normal", forcePush ? "text-danger" : "text-fg-2")}>{why}</p>}
        </div>
      </div>

      {hasDetails && (
        <details className="group -mt-1 border-t border-accent/15 pt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-accent [&::-webkit-details-marker]:hidden">
            {toggle}
            <span aria-hidden className="size-1.5 -translate-y-0.5 rotate-45 border-r-[1.5px] border-b-[1.5px] border-current transition-transform group-open:-rotate-[135deg] group-open:translate-y-0" />
          </summary>
          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface px-3.5 py-3">
            {own && <OwnActionDetails action={own} compact hideWhy />}
            {fields.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                {fields.slice(0, 4).map((field) => (
                  <div key={field.key} className="contents">
                    <dt className="text-muted">{field.label}</dt>
                    <dd className="min-w-0 [overflow-wrap:anywhere]">{field.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {preview && (
              <p className={cn("max-h-[160px] overflow-auto text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]", fields.length > 0 && "border-t border-line pt-2")}>
                {preview}
              </p>
            )}
          </div>
        </details>
      )}

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
