"use client";

import { useEffect, useMemo, useState } from "react";
import { AvailableAppCard, ConnectedAppCard } from "@/components/apps/app-cards";
import { ALL_CATEGORIES, categoriesOf, filterApps, isConnectable, NOT_AVAILABLE_LABEL, splitApps } from "@/components/apps/apps-logic";
import { LockIcon, SearchIcon } from "@/components/icons";
import { PageBody } from "@/components/page";
import { Card, EmptyState, ErrorState, FilterPills, SectionLabel, SkeletonRows } from "@/components/ui";
import { useApps } from "@/lib/api/hooks";
import { titleCase } from "@/lib/format";

export default function AppsPage() {
  const apps = useApps();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);

  // A connection can also finish in another tab (onboarding), so look again whenever this one gets focus.
  const refetch = apps.refetch;
  useEffect(() => {
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  const catalog = apps.data;
  const categories = useMemo(
    () => [
      { value: ALL_CATEGORIES, label: "All" },
      ...categoriesOf(catalog ?? []).map((value) => ({ value, label: titleCase(value) })),
    ],
    [catalog],
  );

  if (apps.isPending) {
    return (
      <PageBody>
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </PageBody>
    );
  }
  if (apps.isError) {
    return (
      <PageBody>
        <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />
      </PageBody>
    );
  }
  if (apps.data.length === 0) {
    return (
      <PageBody>
        <EmptyState mood="asleep" title="No apps to connect yet">
          The catalog is empty right now. Check back soon.
        </EmptyState>
      </PageBody>
    );
  }

  // A category that has disappeared from the catalog falls back to All.
  const activeCategory = categories.some((c) => c.value === category) ? category : ALL_CATEGORIES;
  const { connected, available } = splitApps(filterApps(apps.data, search, activeCategory));

  return (
    <PageBody>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-[34px] w-60 items-center gap-2 rounded-full border border-line bg-surface px-3.5 focus-within:border-fg/50">
          <SearchIcon size={14} className="shrink-0 text-muted" />
          <span className="sr-only">Search apps</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search apps"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted/80"
          />
        </label>
        <FilterPills label="Filter by category" options={categories} value={activeCategory} onChange={setCategory} />
      </div>

      {connected.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Connected</SectionLabel>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3.5">
            {connected.map((app) => (
              <ConnectedAppCard key={app.slug} app={app} />
            ))}
          </div>
        </section>
      )}

      {available.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>{connected.length > 0 || splitApps(apps.data).connected.length > 0 ? "Add more" : "Connect an app"}</SectionLabel>
          <div className="-mx-3 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-x-2 gap-y-0.5">
            {available.map((app) => (
              <AvailableAppCard key={app.slug} app={app} />
            ))}
          </div>
          {available.some((app) => !isConnectable(app)) && (
            <p className="text-[12.5px] text-muted">
              “{NOT_AVAILABLE_LABEL}” means we haven’t set that app up on Textcrew yet. It gets a Connect button when we have.
            </p>
          )}
        </section>
      )}

      {connected.length === 0 && available.length === 0 && (
        <p className="text-[13.5px] text-muted">No app matches that. On Max, Tex can also use your own tools through an MCP server.</p>
      )}

      <p className="flex items-center gap-2.5 border-t border-line pt-4 text-[13px] text-muted">
        <LockIcon size={16} className="shrink-0" />
        <span>Apps connect through their own sign-in screens. We never see your passwords, and access tokens are never handed to Tex.</span>
      </p>
    </PageBody>
  );
}
