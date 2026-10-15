"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApprovals, useMe } from "@/lib/api/hooks";
import { cn, formatNumber } from "@/lib/format";
import { INTEGRATIONS_PATH } from "@/lib/integrations";
import { ApprovalsIcon, AppsIcon, AutomationsIcon, ChatIcon, MoreIcon } from "../icons";
import { Brand } from "./brand";

/** Phone: the brand and the credit balance across the top. */
export function MobileTopBar() {
  const me = useMe();
  return (
    <header className="flex h-12 shrink-0 items-center justify-between bg-chrome px-4 md:hidden">
      <Brand />
      <Link
        href="/settings/credits"
        aria-label={me.data ? `${formatNumber(me.data.credits.balance)} credits` : "Credits"}
        className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-semibold shadow-[var(--shadow-raised)] tabular-nums"
      >
        {me.data ? formatNumber(me.data.credits.balance) : "…"}
        <span className="font-normal text-muted">credits</span>
      </Link>
    </header>
  );
}

type Tab = { href: string; label: string; icon: ReactNode; badge?: number; also?: string[] };

/** Phone: the five places, under the thumb. Everything else lives behind More. */
export function MobileTabBar() {
  const pathname = usePathname();
  const pending = useApprovals("pending").data?.length ?? 0;
  const tabs: Tab[] = [
    { href: "/", label: "Chat", icon: <ChatIcon size={22} /> },
    { href: "/approvals", label: "Approvals", icon: <ApprovalsIcon size={22} />, badge: pending },
    { href: "/automations", label: "Automations", icon: <AutomationsIcon size={22} /> },
    { href: INTEGRATIONS_PATH, label: "Integrations", icon: <AppsIcon size={22} /> },
    { href: "/more", label: "More", icon: <MoreIcon size={22} />, also: ["/settings", "/activity", "/crew", "/help"] },
  ];
  const isActive = (tab: Tab) =>
    tab.href === "/"
      ? pathname === "/"
      : [tab.href, ...(tab.also ?? [])].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <nav aria-label="Main" className="flex shrink-0 border-t border-line bg-surface px-1 pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      {tabs.map((tab) => {
        const active = isActive(tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-semibold text-fg" : "font-medium text-muted")}
          >
            <span className={cn("relative", active && "text-accent")}>
              {tab.icon}
              {!!tab.badge && (
                <span className="absolute -top-1 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white tabular-nums">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
