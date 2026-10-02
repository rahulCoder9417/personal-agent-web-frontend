"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAgentStatus, useApprovals, useMe, usePlans } from "@/lib/api/hooks";
import { describeAgent } from "@/lib/agent-state";
import { cn, formatAgo, formatDate, formatNumber, initials, titleCase } from "@/lib/format";
import { ActivityIcon, ApprovalsIcon, AppsIcon, AutomationsIcon, ChatIcon, CrewIcon, SettingsIcon } from "../icons";
import { Brand } from "./brand";
import { useAppConfig } from "./providers";
import { AgentFigure } from "../tex";

type Item = { href: string; label: string; icon: ReactNode; badge?: number; note?: string };

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-[34px] items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] transition-colors",
        active ? "bg-surface font-semibold text-fg shadow-[var(--shadow-raised)]" : "font-medium text-nav hover:bg-fg/[0.05] hover:text-fg",
      )}
    >
      <span className={cn("shrink-0", active ? "text-accent" : "text-muted group-hover:text-fg")}>{item.icon}</span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.note && <span className="text-[11.5px] text-muted">{item.note}</span>}
      {!!item.badge && (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white tabular-nums">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && <p className="px-2.5 pt-1 pb-1.5 text-[12px] font-medium text-muted">{label}</p>}
      {children}
    </div>
  );
}

/** Tex, and what it is doing right now. The one place the whole app looks to for the agent's state. */
function AgentCard() {
  const status = useAgentStatus();
  const pending = useApprovals("pending").data?.length ?? 0;
  const agent = describeAgent(status.data?.state, pending);
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-fg/[0.05]" aria-live="polite">
      <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-accent-soft">
        <AgentFigure who="tex" mood={agent.mood} glyph size={32} label="" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13.5px] font-semibold">{agent.title}</span>
        <span className="truncate text-[12px] text-muted">
          {status.data?.lastActiveAt ? `Active ${formatAgo(status.data.lastActiveAt)}` : "Ready when you are"}
        </span>
      </span>
    </Link>
  );
}

function CreditsCard() {
  const me = useMe();
  const plans = usePlans();
  if (!me.data) return <div aria-hidden className="h-[86px] animate-pulse rounded-xl bg-fg/[0.05]" />;
  const { balance, nextExpiry } = me.data.credits;
  const plan = plans.data?.plans.find((p) => p.id === me.data.plan);
  const low = balance <= 20;
  return (
    <Link href="/settings/credits" className="flex flex-col gap-1 rounded-xl bg-surface px-3 py-2.5 shadow-[var(--shadow-raised)] transition-shadow hover:shadow-[var(--shadow-soft)]">
      <span className="flex items-center justify-between text-[12px] text-muted">
        Credits
        <span className="rounded bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-dark">{plan?.name ?? titleCase(me.data.plan)}</span>
      </span>
      <span className={cn("text-[22px] leading-none font-semibold tracking-[-0.03em] tabular-nums", low && "text-danger")}>{formatNumber(balance)}</span>
      <span className="truncate text-[12px] text-muted">
        {low ? "Tex pauses at zero. Add credits" : nextExpiry ? `Next expiry ${formatDate(nextExpiry)}` : "No expiry coming up"}
      </span>
    </Link>
  );
}

/** The left side of the page on wide screens: Tex's state, the places to go, credits and the account. */
export function Sidebar() {
  const pathname = usePathname();
  const pending = useApprovals("pending").data?.length ?? 0;
  const me = useMe();
  const { mode } = useAppConfig();

  const work: Item[] = [
    { href: "/", label: "Chat", icon: <ChatIcon size={18} /> },
    { href: "/approvals", label: "Approvals", icon: <ApprovalsIcon size={18} />, badge: pending },
    { href: "/automations", label: "Automations", icon: <AutomationsIcon size={18} /> },
    { href: "/activity", label: "Activity", icon: <ActivityIcon size={18} /> },
  ];
  const setup: Item[] = [
    { href: "/apps", label: "Apps", icon: <AppsIcon size={18} /> },
    { href: "/crew", label: "Crew", icon: <CrewIcon size={18} />, note: "soon" },
    { href: "/settings", label: "Settings", icon: <SettingsIcon size={18} /> },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label="Main" className="flex w-[236px] shrink-0 flex-col gap-4 px-2.5 pt-4 pb-3 max-md:hidden">
      <div className="flex items-center gap-2 px-1.5 pb-1">
        <Brand />
        {mode !== "clerk" && (
          <span className="rounded-full bg-fg/[0.06] px-2 py-px font-mono text-[10.5px] text-nav">{mode === "demo" ? "demo" : "local"}</span>
        )}
      </div>
      <AgentCard />
      <Group>
        {work.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </Group>
      <Group label="Set up">
        {setup.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </Group>

      <div className="mt-auto flex flex-col gap-2.5">
        <CreditsCard />
        <Link href="/settings" className="flex items-center gap-2.5 rounded-[9px] px-1.5 py-1 transition-colors hover:bg-fg/[0.05]">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-fg text-[11px] font-semibold text-white">
            {me.data ? initials(me.data.name || me.data.email) : ""}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13px] font-medium">{me.data?.name || "Your account"}</span>
            <span className="truncate text-[12px] text-muted">{me.data?.email ?? " "}</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}
