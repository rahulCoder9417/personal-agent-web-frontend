import type { OwnAction } from "@/lib/approvals";
import { cn } from "@/lib/format";
import { WarningIcon } from "../icons";

/**
 * One of the agent's own actions, shown plainly so the user sees exactly what they approve: the command or the
 * file, word for word; the repository and the branch of a push, and a warning when it is a force push; the list
 * of what a crew job's run was refused. `compact`: the card in the chat; otherwise the Approvals screen. `hideWhy`: the card already says why above.
 */
export function OwnActionDetails({ action, compact = false, hideWhy = false }: { action: OwnAction; compact?: boolean; hideWhy?: boolean }) {
  const row = (label: string, value: React.ReactNode, mono = false) => (
    <div className="flex gap-3">
      <dt className={cn("shrink-0 text-muted", compact ? "w-[64px] text-[12.5px]" : "w-[84px] text-[12px] leading-5")}>{label}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-[12.5px]")}>{value}</dd>
    </div>
  );

  if (action.kind === "command") {
    const isCommand = action.tool === "Bash";
    return (
      <div className="flex flex-col gap-2.5">
        <div>
          <p className="mb-1 text-[12px] text-muted">{isCommand ? "The exact command" : `The file (${action.tool})`}</p>
          <pre
            aria-label={isCommand ? "Command" : "File"}
            className={cn(
              "overflow-x-auto rounded-lg bg-fg px-3 py-2.5 font-mono whitespace-pre-wrap break-all text-surface",
              compact ? "max-h-[160px] text-[12.5px]" : "max-h-[320px] text-[13px]",
            )}
          >
            {action.target}
          </pre>
        </div>
        <dl className={cn("flex flex-col gap-1", compact ? "text-[13px]" : "text-[14px]")}>
          {action.why && !hideWhy && row("Why", `It needs your OK because ${action.why}.`)}
          {action.folder && row("Folder", action.folder, true)}
        </dl>
      </div>
    );
  }

  if (action.kind === "git_push") {
    return (
      <div className="flex flex-col gap-2.5">
        <dl className={cn("flex flex-col gap-1", compact ? "text-[13px]" : "text-[14px]")}>
          {row("Repository", action.repo, true)}
          {row("Branch", action.branch, true)}
          {row("Kind", action.force ? "Force push" : "New commits on a branch that already existed")}
        </dl>
        {action.force && (
          <p className="flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <WarningIcon size={15} className="mt-[1px] shrink-0" />
            A force push rewrites the branch’s history: commits on it that are not in this push are lost.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {action.job && <p className={cn("font-medium", compact ? "text-[13px]" : "text-[14px]")}>{action.job}</p>}
      <p className="text-[12px] text-muted">Allowed once each when the job runs again:</p>
      <ul className={cn("flex list-disc flex-col gap-1 pl-5", compact ? "text-[13px]" : "text-[14px]")}>
        {action.items.map((item) => (
          <li key={item} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
