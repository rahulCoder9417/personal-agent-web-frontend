"use client";

import { useState } from "react";
import { ActivityRow } from "@/components/activity/activity-row";
import { creditsToday, groupByDay, matchesFilter, type ActivityFilter } from "@/components/activity/group";
import { Page, PageBody, PageHeader } from "@/components/page";
import { Button, Card, EmptyState, ErrorState, FilterPills, InlineError, SkeletonRows, type FilterOption } from "@/components/ui";
import { useActivity, useMe } from "@/lib/api/hooks";
import { formatCredits, initials } from "@/lib/format";

const FILTERS: FilterOption<ActivityFilter>[] = [
  { value: "all", label: "All" },
  { value: "tex", label: "Tex" },
  { value: "you", label: "You" },
  { value: "automations", label: "Automations" },
  { value: "approvals", label: "Approvals" },
];

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const activity = useActivity();
  const me = useMe();

  const loaded = activity.data?.pages.flatMap((page) => page.items) ?? [];
  const shown = loaded.filter((entry) => matchesFilter(entry, filter));
  const days = groupByDay(shown);
  const userInitials = me.data ? initials(me.data.name) : "";
  const today = creditsToday(loaded);

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
            Once Tex does something for you, every action shows up here with the credits it used.
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
                    <ActivityRow key={entry.id} entry={entry} userInitials={userInitials} />
                  ))}
                </ul>
              </section>
            ))}
          </Card>
        )}

        {activity.data && loaded.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-3.5">
              {activity.hasNextPage && (
                <Button pending={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
                  Load older
                </Button>
              )}
              <span className="text-[12px] text-muted">newest first · kept until you delete your account</span>
            </div>
            {activity.isFetchNextPageError && <InlineError error={activity.error} />}
          </div>
        )}
      </PageBody>
    </Page>
  );
}
