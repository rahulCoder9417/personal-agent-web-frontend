"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export type RouteTab = {
  href: string;
  label: string;
  /** Small note after the label, e.g. the plan a section needs. */
  chip?: ReactNode;
  /** Match the path exactly (for the section's index page). */
  exact?: boolean;
};

/** Tabs in a page header that switch between the pages of one section. */
export function RouteTabs({ label, tabs }: { label: string; tabs: RouteTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex max-w-full overflow-x-auto rounded-[10px] bg-surface-2 p-[3px] [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
              active ? "bg-surface text-fg shadow-[var(--shadow-raised)]" : "text-nav hover:text-fg",
            )}
          >
            {tab.label}
            {tab.chip && <span className="rounded bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-dark">{tab.chip}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
