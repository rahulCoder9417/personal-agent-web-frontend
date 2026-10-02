"use client";

import type { LedgerEntry } from "@/lib/api/client";
import { useLedger } from "@/lib/api/hooks";
import { Button, Card, ErrorState, InlineError, SkeletonRows } from "@/components/ui";
import { cn, formatDateTime, formatNumber } from "@/lib/format";

const REASON_LABEL: Record<LedgerEntry["reason"], string> = {
  grant: "added",
  charge: "used",
  expire: "expired",
  refund: "refund",
  adjust: "adjusted",
  reversal: "reversed",
};

function signed(delta: number): string {
  if (delta === 0) return "0";
  // A real minus sign, so the column lines up with the plus.
  return `${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta))}`;
}

/** The append-only credit history: every grant, charge, expiry and refund. */
export function LedgerCard() {
  const ledger = useLedger();
  const entries = ledger.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card role="group" aria-label="Credit history" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
        <h2 className="text-[15px] font-semibold">History</h2>
        <span className="text-[12px] text-muted">every grant, charge, expiry and refund</span>
      </div>

      {ledger.isPending ? (
        <SkeletonRows rows={4} />
      ) : ledger.isError && entries.length === 0 ? (
        <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} className="m-4 border-0" />
      ) : entries.length === 0 ? (
        <p className="px-6 pb-6 text-[13.5px] text-muted">Nothing here yet. Each task Tex does shows up with what it cost.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-line text-[11.5px] text-muted">
              <th scope="col" className="w-[168px] py-2.5 pr-3 pl-6 font-medium">When</th>
              <th scope="col" className="py-2.5 pr-3 font-medium">What</th>
              <th scope="col" className="w-[110px] py-2.5 pr-3 font-medium">Reason</th>
              <th scope="col" className="w-[110px] py-2.5 pr-6 text-right font-medium">Credits</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-line last:border-b-0">
                <td className="py-3 pr-3 pl-6 text-[12px] whitespace-nowrap text-muted">{formatDateTime(entry.createdAt)}</td>
                <td className="truncate py-3 pr-3" title={entry.description}>
                  {entry.description || "Credits"}
                </td>
                <td className="py-3 pr-3 text-[12px] text-muted">{REASON_LABEL[entry.reason]}</td>
                <td className={cn("py-3 pr-6 text-right text-[12.5px] font-medium", entry.delta > 0 ? "text-success" : "text-fg")}>
                  {signed(entry.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {(ledger.hasNextPage || ledger.isFetchNextPageError) && (
        <div className="flex items-center gap-3 border-t border-line px-6 py-3">
          <Button size="sm" pending={ledger.isFetchingNextPage} onClick={() => ledger.fetchNextPage()}>
            Load older
          </Button>
          {ledger.isFetchNextPageError && <InlineError error={ledger.error} />}
        </div>
      )}
    </Card>
  );
}
