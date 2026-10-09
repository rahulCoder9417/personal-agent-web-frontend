"use client";

import { useMemo, useState } from "react";
import { ActivityRow } from "@/components/activity/activity-row";
import { creditsToday, groupByDay, matchesFilter, type ActivityFilter } from "@/components/activity/group";
import { Page, PageBody, PageHeader } from "@/components/page";
import { toastError } from "@/components/toast";
import { Button, Card, EmptyState, ErrorState, FilterPills, SkeletonRows, type FilterOption } from "@/components/ui";
import { useActivity, useMe, useMemories } from "@/lib/api/hooks";
import { formatCredits, initials } from "@/lib/format";

const FILTERS: FilterOption<ActivityFilter>[] = [
  { value: "all", label: "All" },
  { value: "tex", label: "Tex" },
  { value: "crew", label: "Crew" },
  { value: "you", label: "You" },
  { value: "memory", label: "Memory" },
  { value: "automations", label: "Automations" },
  { value: "approvals", label: "Approvals" },
];

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const activity = useActivity();
  const me = useMe();
  // The memories that still exist: an entry about one of them links to it.
  const memories = useMemories();
  const memoryIds = useMemo(() => new Set((memories.data?.items ?? []).map((memory) => memory.id)), [memories.data]);

  const loaded = activity.data?.pages.flatMap((page) => page.items) ?? [];
  const shown = loaded.filter((entry) => matchesFilter(entry, filter));
  const days = groupByDay(shown);
  const userInitials = me.data ? initials(me.data.name) : "";
  const today = creditsToday(loaded);
  // The button stays, so a failed page can be asked for again; the toast says why it failed.
  const loadOlder = () =>
    void activity.fetchNextPage().then((result) => {
      if (result.isFetchNextPageError) toastError("Couldn’t load older activity", result.error);
    });

  return (
    <Page>
      <PageHeader title="Activity">
        <p className="truncate text-[13px] text-muted">Everything Tex did, when, and what it cost.</p>
      </PageHeader>

      <PageBody className="gap-4">
        <div className="flex min-h-[30px] flex-wrap items-center gap-4">
          <FilterPills label="Filter activity" options={FILTERS} value={filter} onChange={setFilter} />
          {activity.data && (
            <span className="ml-auto text-[12px] text-muted">
              {shown.length} {shown.length === 1 ? "entry" : "entries"}
              {activity.hasNextPage ? " loaded" : ""} · {formatCredits(today)} used today
            </span>
          )}
        </div>

        {activity.isError && !activity.data ? (
          <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
        ) : activity.isPending ? (
          <Card className="overflow-hidden">
            <SkeletonRows rows={7} />
          </Card>
        ) : loaded.length === 0 ? (
          <EmptyState mood="asleep" title="Nothing logged yet">
            Once Tex does something for you, every action shows up here. One that changes something costs 1 credit; reading and searching are free.
          </EmptyState>
        ) : days.length === 0 ? (
          <Card className="px-5 py-7 text-muted">
            Nothing matches this filter in what’s loaded so far.{activity.hasNextPage ? " Older entries may." : ""}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {days.map((day, index) => (
              <section key={day.key} aria-label={day.label}>
                <h2
                  className={`bg-chrome px-5 py-[9px] text-[11.5px] font-medium text-muted ${index > 0 ? "border-t border-line" : ""}`}
                >
                  {day.label}
                </h2>
                <ul>
                  {day.entries.map((entry) => (
                    <ActivityRow key={entry.id} entry={entry} userInitials={userInitials} memories={memoryIds} />
                  ))}
                </ul>
              </section>
            ))}
          </Card>
        )}

        {activity.data && loaded.length > 0 && (
          <div className="flex items-center justify-center gap-3.5">
            {activity.hasNextPage && (
              <Button pending={activity.isFetchingNextPage} onClick={loadOlder}>
                Load older
              </Button>
            )}
            <span className="text-[12px] text-muted">newest first · kept until you delete your account</span>
          </div>
        )}
      </PageBody>
    </Page>
  );
}
