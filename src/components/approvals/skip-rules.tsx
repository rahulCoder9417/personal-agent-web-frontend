"use client";

import type { SkipRule } from "@/lib/api/client";
import { useDeleteSkipRule, useSkipRules } from "@/lib/api/hooks";
import { SKIP_RULES_EMPTY, SKIP_RULES_INTRO, ruleScopeLine } from "@/lib/approvals";
import { cn, formatDate, titleCase } from "@/lib/format";
import { ConfirmButton } from "../confirm-button";
import { toast, toastError } from "../toast";
import { EmptyState, ErrorState, IconTile, SkeletonRows } from "../ui";
import { ApprovalIcon, CARD_EDGE } from "./approval-list";

/**
 * The Approvals page's "Skip rules": each "Don't ask again" the user made, with Remove. Rules are made
 * only from an approval card; the agent can't make or change one.
 */
export function SkipRules() {
  const rules = useSkipRules();
  const remove = useDeleteSkipRule();

  if (rules.isError) return <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />;
  return (
    <div className="flex flex-col gap-3">
      {/* With none, the empty state says it all. */}
      {(rules.isPending || rules.data.length > 0) && <p className="text-[13px] leading-normal text-fg-2">{SKIP_RULES_INTRO}</p>}
      {rules.isPending ? (
        <SkeletonRows rows={2} className={cn("rounded-xl", CARD_EDGE)} />
      ) : (
        <SkipRuleList
          rules={rules.data}
          removingId={remove.isPending ? (remove.variables ?? null) : null}
          onRemove={(rule) =>
            remove.mutate(rule.id, {
              onSuccess: () => toast({ title: "Removed. Tex asks again for this", body: `${rule.actionName} ${lowerFirst(ruleScopeLine(rule))}.` }),
              onError: (error) => toastError("Couldn’t remove the rule", error),
            })
          }
        />
      )}
    </div>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The rules, newest first, or an empty state that says what a rule is and where one is made. */
export function SkipRuleList({ rules, removingId, onRemove }: { rules: SkipRule[]; removingId: string | null; onRemove: (rule: SkipRule) => void }) {
  if (rules.length === 0)
    return (
      <EmptyState mood="ready" title={SKIP_RULES_EMPTY.title} className="py-10">
        {SKIP_RULES_EMPTY.body}
      </EmptyState>
    );
  return (
    <ul aria-label="Skip rules" className="flex flex-col gap-2">
      {rules.map((rule) => {
        const scope = ruleScopeLine(rule);
        return (
          <li key={rule.id} className={cn("flex items-center gap-3 rounded-xl bg-surface p-3", CARD_EDGE)}>
            <IconTile size={36}>
              <ApprovalIcon app={rule.app} />
            </IconTile>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[14px] font-semibold">
                {rule.actionName}
                <span className="font-normal text-muted"> · {titleCase(rule.app)}</span>
              </span>
              <span className="text-[13px] text-fg-2 [overflow-wrap:anywhere]">{scope}</span>
              <span className="text-[12px] text-muted">Made {formatDate(rule.createdAt)}</span>
            </span>
            <ConfirmButton
              label="Remove"
              confirmLabel="Remove"
              ariaLabel={`Remove the rule: ${rule.actionName} ${lowerFirst(scope)}`}
              pending={removingId === rule.id}
              onConfirm={() => onRemove(rule)}
            />
          </li>
        );
      })}
    </ul>
  );
}
