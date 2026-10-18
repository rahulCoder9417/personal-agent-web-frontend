import type { Approval, ApprovalRun } from "@/lib/api/client";
import { APPROVAL_RESULT, approvalReasonOf, ownAction, runLine, splitDetails, type OwnAction, type SettledStatus } from "@/lib/approvals";
import { cn } from "@/lib/format";
import { CheckIcon, CloseIcon } from "../icons";
import { OwnActionDetails } from "./own-action";

type Parts = ReturnType<typeof splitDetails>;

/** What the calm approval card and the Approvals page both show, worked out once from an approval. */
export function approvalView(approval: Approval): { own: OwnAction | null; why: string | null; forcePush: boolean; toggle: string; hasDetails: boolean } & Parts {
  const reason = approvalReasonOf(approval);
  // One of the agent's own actions (a command, a push, a job run again): shown as it is, not as fields.
  const own = ownAction(approval);
  const { preview, fields } = own ? { preview: null, fields: [] } : splitDetails(approval.details);
  const forcePush = own?.kind === "git_push" && own.force;
  const why =
    own?.kind === "command" && own.why
      ? `It needs your OK because ${own.why}.`
      : forcePush
        ? "A force push rewrites the branch’s history."
        : reason.label === "Needs your OK"
          ? null
          : `${reason.label}.`;
  const toggle = own?.kind === "command" ? (own.tool === "Bash" ? "Show the exact command" : "Show the file") : "Show the details";
  return { own, preview, fields, why, forcePush, toggle, hasDetails: own !== null || fields.length > 0 || preview !== null };
}

/** The title: plain, cut to two lines, long unbroken words (a link) wrap instead of running off the side. */
export function ApprovalTitle({ summary, className }: { summary: string; className?: string }) {
  return <span className={cn("line-clamp-2 text-[15px] leading-[1.35] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]", className)}>{summary}</span>;
}

/**
 * What will really run (an app action's `facts`), written by the server from the action's inputs, never from
 * Tex's summary: the app and action, who it goes to or who gets access, the repository, calendar or file, the
 * subject and the first words. Always shown, so a wrong or tricked summary can't hide where it really goes. The
 * same facts are the second line of the question on Telegram, WhatsApp and iMessage.
 */
export function ApprovalFacts({ approval, className }: { approval: Approval; className?: string }) {
  const facts = approval.facts ?? [];
  if (facts.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl bg-surface px-3.5 py-3", className)} aria-label="What will run">
      <span className="text-[12px] font-semibold text-muted">What will run</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {facts.map((fact, i) => (
          <div key={`${fact.label}-${i}`} className="contents">
            <dt className="text-muted">{fact.label}</dt>
            <dd className={cn("min-w-0 [overflow-wrap:anywhere]", i === 0 && "font-medium")}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The exact details, folded behind a quiet toggle (`open`: unfolded to begin with). */
export function ApprovalDetailsFold({ approval, open = false, className }: { approval: Approval; open?: boolean; className?: string }) {
  const { own, fields, preview, toggle, hasDetails } = approvalView(approval);
  if (!hasDetails) return null;
  return (
    <details open={open} className={cn("group border-t border-accent/15 pt-3", className)}>
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
  );
}

const TONE_CLASS = { success: "text-success", danger: "text-danger", muted: "text-muted" } as const;

/** After a decision: one tinted line, "You approved – <what>". */
export function DecidedLine({ approval, className }: { approval: Approval; className?: string }) {
  const result = APPROVAL_RESULT[approval.status as SettledStatus];
  if (!result) return null;
  const tint = result.tone === "success" ? "bg-success-soft" : result.tone === "danger" ? "bg-danger-soft" : "bg-surface-2";
  return (
    <div className={cn("flex w-full items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] leading-5 font-medium", tint, TONE_CLASS[result.tone], className)}>
      {result.icon === "check" && <CheckIcon size={14} className="shrink-0" />}
      {result.icon === "close" && <CloseIcon size={14} className="shrink-0" />}
      <span className="min-w-0 truncate">
        {result.text}
        <span className="font-normal text-muted"> – {approval.summary}</span>
      </span>
    </div>
  );
}

/** How the platform's run of an app action went (after the yes, or by a skip rule): one line, then the app's short answer. */
export function RunResult({ run, className }: { run: ApprovalRun; className?: string }) {
  const line = runLine(run);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className={cn("text-[13px] leading-5 font-medium [overflow-wrap:anywhere]", TONE_CLASS[line.tone])}>{line.text}</p>
      {run.result && (
        <pre
          aria-label="What the app answered"
          className="max-h-[140px] overflow-auto rounded-xl bg-surface px-3.5 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]"
        >
          {run.result}
        </pre>
      )}
    </div>
  );
}
