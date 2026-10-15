"use client";

import { useState } from "react";
import { ApprovalDetail } from "@/components/approvals/approval-detail";
import { ApprovalList } from "@/components/approvals/approval-list";
import { Page, PageHeader } from "@/components/page";
import { EmptyState, ErrorState, FilterPills, SkeletonRows, type FilterOption } from "@/components/ui";
import type { Mood } from "@/components/tex";
import type { ApprovalStatus } from "@/lib/api/client";
import { useApprovals } from "@/lib/api/hooks";

const TABS: { value: ApprovalStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Denied" },
  { value: "expired", label: "Expired" },
];

const EMPTY: Record<ApprovalStatus, { mood: Mood; title: string; body: string }> = {
  pending: {
    mood: "done",
    title: "All caught up",
    body: "Nothing is waiting on you. Tex will ask here and in your chat when something needs an OK.",
  },
  approved: {
    mood: "ready",
    title: "Nothing approved yet",
    body: "Actions you approve are kept here with what happened next.",
  },
  rejected: {
    mood: "ready",
    title: "Nothing rejected",
    body: "Actions you reject are kept here so you can see what Tex didn’t do.",
  },
  expired: {
    mood: "asleep",
    title: "Nothing expired",
    body: "An approval expires if you don’t answer in time. Tex does nothing when that happens.",
  },
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState<ApprovalStatus>("pending");
  const [selected, setSelected] = useState<string | null>(null);

  // One query per tab: the counts in the tabs stay right, and switching tabs is instant.
  const lists: Record<ApprovalStatus, ReturnType<typeof useApprovals>> = {
    pending: useApprovals("pending"),
    approved: useApprovals("approved"),
    rejected: useApprovals("rejected"),
    expired: useApprovals("expired"),
  };
  const current = lists[tab];
  const approvals = current.data ?? [];
  // Fall back to the first row when the selected approval has left this list.
  const active = approvals.find((a) => a.id === selected) ?? approvals[0] ?? null;

  const options: FilterOption<ApprovalStatus>[] = TABS.map((t) => ({ ...t, count: lists[t.value].data?.length }));
  const pick = (next: ApprovalStatus) => {
    setTab(next);
    setSelected(null);
  };

  return (
    <Page>
      <PageHeader title="Approvals">
        <FilterPills label="Approval status" options={options} value={tab} onChange={pick} />
        <p className="ml-auto hidden truncate text-[13px] text-muted xl:block">
          Tex waits for you before it sends to others, deletes things or spends money.
        </p>
      </PageHeader>

      {current.isError ? (
        <div className="p-7">
          <ErrorState error={current.error} onRetry={() => void current.refetch()} />
        </div>
      ) : !current.isPending && approvals.length === 0 ? (
        // Nothing in this tab: one message for the whole screen, not an empty list beside an empty detail.
        <div className="scroll-pane min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
          <EmptyState mood={EMPTY[tab].mood} title={EMPTY[tab].title} className="mx-auto mt-10 max-w-[620px]">
            {EMPTY[tab].body}
          </EmptyState>
        </div>
      ) : (
        // Wide: the list and the open approval side by side, each scrolling, sharing the whole width
        // (the list takes about a third). Narrow, which includes a tablet beside the sidebar: one column, the list first.
        <div className="scroll-pane flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
          <section
            aria-label={`${TABS.find((t) => t.value === tab)?.label} approvals`}
            className="scroll-pane w-[clamp(330px,34%,480px)] shrink-0 overflow-y-auto pt-2 pr-4 pb-6 pl-8 max-lg:w-full max-lg:overflow-visible max-lg:px-4 max-lg:pb-3 md:max-lg:px-8"
          >
            {current.isPending ? (
              <SkeletonRows rows={3} className="rounded-xl border border-line" />
            ) : approvals.length > 0 ? (
              <ApprovalList approvals={approvals} selectedId={active?.id ?? null} onSelect={setSelected} />
            ) : (
              <p className="px-1 py-2 text-muted">Nothing here.</p>
            )}
          </section>

          <section
            aria-label="Approval details"
            className="scroll-pane min-w-0 flex-1 overflow-y-auto pt-2 pr-8 pb-6 pl-3 max-lg:flex-none max-lg:overflow-visible max-lg:px-4 md:max-lg:px-8"
          >
            {current.isPending ? (
              <div aria-hidden className="h-[320px] animate-pulse rounded-[20px] border border-line bg-surface" />
            ) : active ? (
              <ApprovalDetail
                key={active.id}
                approval={active}
                onDecided={(decision) => {
                  // Follow the approval to the tab it just moved to.
                  setTab(decision === "approve" ? "approved" : "rejected");
                  setSelected(active.id);
                }}
              />
            ) : (
              <EmptyState mood={EMPTY[tab].mood} title={EMPTY[tab].title}>
                {EMPTY[tab].body}
              </EmptyState>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
