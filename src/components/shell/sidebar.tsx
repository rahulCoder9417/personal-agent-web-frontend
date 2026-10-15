"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAgentStatus, useApprovals, useCrew, useMe, usePlans } from "@/lib/api/hooks";
import { describeAgent } from "@/lib/agent-state";
import { crewNavNote } from "@/lib/crew";
import { cn, formatAgo, formatDate, formatNumber, initials, titleCase } from "@/lib/format";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { PANEL_MOTION, useMotionReady } from "@/lib/motion";
import { PANELS } from "@/lib/panels";
import { useStoredFlag } from "@/lib/stored-flag";
import { INTEGRATIONS_PATH } from "@/lib/integrations";
import { ActivityIcon, ApprovalsIcon, AppsIcon, AutomationsIcon, ChatIcon, ChevronsLeftIcon, CrewIcon, SettingsIcon } from "../icons";
import { GettingStartedNav } from "../onboarding/getting-started";
import { IconButton } from "../ui";
import { Brand } from "./brand";
import { useAppConfig } from "./providers";
import { AgentFigure } from "../tex";

type Item = { href: string; label: string; icon: ReactNode; badge?: number; note?: string };

// Folded down to a rail of icons, the sidebar is 60px wide, which keeps every icon where it was.
// What has no room there (the words, the credits card) fades out, faster than the sidebar folds,
// so nothing is seen being cut short; the words stay readable to a screen reader, which reads
// each icon's link by them.
const FADE = "transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none";
const RAIL_FADES = "group-data-[collapsed]/nav:opacity-0";
// What is there only on the rail.
const RAIL_ONLY = "opacity-0 group-data-[collapsed]/nav:opacity-100";

function NavLink({ item, active, collapsed }: { item: Item; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex h-[34px] items-center gap-2.5 overflow-hidden rounded-[9px] px-2.5 text-[13.5px] transition-colors",
        active ? "bg-surface font-semibold text-fg shadow-[var(--shadow-raised)]" : "font-medium text-nav hover:bg-fg/[0.05] hover:text-fg",
      )}
    >
      <span className={cn("relative shrink-0", active ? "text-accent" : "text-muted group-hover:text-fg")}>
        {item.icon}
        {!!item.badge && (
          <span
            aria-hidden
            className={cn(
              "absolute -top-1.5 -right-2 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-[3px] text-[9.5px] font-semibold text-white tabular-nums",
              FADE,
              RAIL_ONLY,
            )}
          >
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        )}
      </span>
      {/* Not cut short as the sidebar folds: the words keep their width and fade where they are. */}
      <span className={cn("flex-1 whitespace-nowrap", FADE, RAIL_FADES)}>{item.label}</span>
      {item.note && <span className={cn("text-[11.5px] whitespace-nowrap text-muted", FADE, RAIL_FADES)}>{item.note}</span>}
      {!!item.badge && (
        <span
          className={cn(
            "grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white tabular-nums",
            FADE,
            RAIL_FADES,
          )}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <p className="relative px-2.5 pt-1 pb-1.5 text-[12px] font-medium whitespace-nowrap text-muted">
          <span className={cn(FADE, RAIL_FADES)}>{label}</span>
          {/* On the rail a short line stands in for the words. */}
          <span aria-hidden className={cn("absolute inset-x-2.5 top-1/2 h-px bg-line-strong", FADE, RAIL_ONLY)} />
        </p>
      )}
      {children}
    </div>
  );
}

/** Tex, and what it is doing right now. The one place the whole app looks to for the agent's state. */
function AgentCard({ shown, collapsed }: { shown: boolean; collapsed: boolean }) {
  const status = useAgentStatus(shown);
  const pending = useApprovals("pending").data?.length ?? 0;
  const agent = describeAgent(status.data?.state, pending);
  const lastActive = status.data?.lastActiveAt ? `Active ${formatAgo(status.data.lastActiveAt)}` : "Ready when you are";
  return (
    <Link
      href="/"
      title={collapsed ? `${agent.title} · ${lastActive}` : undefined}
      className={cn(
        "flex items-center gap-2.5 overflow-hidden rounded-xl px-1.5 py-1.5 transition-[background-color,padding] hover:bg-fg/[0.05] group-data-[collapsed]/nav:px-0",
        PANEL_MOTION,
      )}
      aria-live="polite"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-accent-soft">
        <AgentFigure who="tex" mood={agent.mood} glyph size={32} label="" />
      </span>
      <span className={cn("flex min-w-0 flex-col", FADE, RAIL_FADES)}>
        <span className="truncate text-[13.5px] font-semibold">{agent.title}</span>
        <span className="truncate text-[12px] text-muted">{lastActive}</span>
      </span>
    </Link>
  );
}

/** The balance in a few characters, for the rail: 980, 1.9K, 12K. */
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Credits on the rail: the balance alone, in a tile the width of an icon's link, red when it is
 * low. It leads where the card does.
 */
function CreditsTile() {
  const me = useMe();
  const balance = me.data?.credits.balance;
  return (
    <Link
      href="/settings/credits"
      aria-label={balance === undefined ? "Credits" : `${formatNumber(balance)} credits`}
      title={balance === undefined ? "Credits" : `${formatNumber(balance)} credits`}
      className={cn(
        "pointer-events-auto invisible grid h-10 w-10 place-items-center rounded-xl bg-surface text-[12px] font-semibold tracking-[-0.02em] tabular-nums shadow-[var(--shadow-raised)] transition-shadow hover:shadow-[var(--shadow-soft)] group-data-[collapsed]/nav:visible",
        FADE,
        RAIL_ONLY,
        balance !== undefined && balance <= 20 && "text-danger",
      )}
    >
      {balance === undefined ? "…" : compact.format(balance)}
    </Link>
  );
}

function CreditsCard({ shown }: { shown: boolean }) {
  const me = useMe();
  const plans = usePlans(shown);
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

/**
 * The left side of the page on wide screens: Tex's state, the places to go, credits and the account.
 * On a phone it is hidden but still drawn, so a wide screen gets it without a jump. What only it
 * shows (the agent's state away from the chat, the crew note, the plan's name) isn't asked for
 * there; the account and approvals are, for the phone's own top bar and tabs.
 *
 * The button at its top folds it down to a rail of icons and opens it again; this browser
 * remembers which (`PANELS.nav`). On the rail each icon still leads where it did and says where
 * when pointed at, approvals waiting show on their icon, and the credits card becomes the balance.
 */
export function Sidebar() {
  const pathname = usePathname();
  const shown = useMediaQuery(SHOWN_AT.sidebar);
  const collapsed = useStoredFlag(PANELS.nav);
  const motion = useMotionReady();
  const pending = useApprovals("pending").data?.length ?? 0;
  const me = useMe();
  const crew = useCrew(shown);
  const { mode } = useAppConfig();

  const work: Item[] = [
    { href: "/", label: "Chat", icon: <ChatIcon size={18} /> },
    { href: "/approvals", label: "Approvals", icon: <ApprovalsIcon size={18} />, badge: pending },
    { href: "/automations", label: "Automations", icon: <AutomationsIcon size={18} /> },
    { href: "/activity", label: "Activity", icon: <ActivityIcon size={18} /> },
  ];
  const setup: Item[] = [
    { href: INTEGRATIONS_PATH, label: "Integrations", icon: <AppsIcon size={18} /> },
    { href: "/crew", label: "Crew", icon: <CrewIcon size={18} />, note: crewNavNote(crew.data) },
    { href: "/settings", label: "Settings", icon: <SettingsIcon size={18} /> },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav
      aria-label="Main"
      data-collapsed={collapsed || undefined}
      data-motion={motion || undefined}
      className={cn(
        "group/nav relative flex shrink-0 flex-col gap-4 overflow-clip px-2.5 pt-4 pb-3 max-md:hidden",
        collapsed ? "w-[60px]" : "w-[236px]",
        motion && cn("transition-[width]", PANEL_MOTION),
        // Until the page has been drawn once, nothing in it moves (`useMotionReady`).
        "[&:not([data-motion])_*]:transition-none",
      )}
    >
      {/* On the rail the brand gives way to the button that opens the sidebar again. */}
      <div className={cn("flex items-center gap-2 px-1.5 pb-1 whitespace-nowrap group-data-[collapsed]/nav:invisible", FADE, RAIL_FADES)}>
        <Brand />
        {mode !== "clerk" && (
          <span className="rounded-full bg-fg/[0.06] px-2 py-px font-mono text-[10.5px] text-nav">{mode === "demo" ? "demo" : "local"}</span>
        )}
      </div>
      {/* Pinned to the sidebar's right edge, so it rides in with it and ends up over the icons. */}
      <IconButton
        label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        onClick={() => PANELS.nav.set(!collapsed)}
        className="absolute top-[13px] right-[15px]"
      >
        <ChevronsLeftIcon size={17} className={cn("transition-transform group-data-[collapsed]/nav:rotate-180", PANEL_MOTION)} />
      </IconButton>
      <AgentCard shown={shown} collapsed={collapsed} />
      <Group>
        {work.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </Group>
      <Group label="Set up">
        {setup.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </Group>

      <div className="mt-auto flex flex-col gap-2.5">
        {/* Until what matters is done or it is hidden: the "Getting started" checklist. */}
        <GettingStartedNav shown={shown} fade={cn(FADE, RAIL_FADES)} railOnly={cn(FADE, RAIL_ONLY)} />
        {/* The card and the rail's tile share a place; one fades as the other comes. The card
            keeps its width, so its words don't wrap as the sidebar folds. */}
        <div className="grid items-end">
          <div className={cn("min-w-[216px] [grid-area:1/1] group-data-[collapsed]/nav:invisible", FADE, RAIL_FADES)}>
            <CreditsCard shown={shown} />
          </div>
          {/* Over the card's lower half: only the tile itself takes a click, so all of the card leads to the credits. */}
          <div className="pointer-events-none [grid-area:1/1]">
            <CreditsTile />
          </div>
        </div>
        <Link
          href="/settings"
          title={collapsed ? (me.data?.name || "Your account") : undefined}
          className="flex items-center gap-2.5 overflow-hidden rounded-[9px] px-1.5 py-1 transition-colors hover:bg-fg/[0.05]"
        >
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-fg text-[11px] font-semibold text-white">
            {me.data ? initials(me.data.name || me.data.email) : ""}
          </span>
          <span className={cn("flex min-w-0 flex-col leading-tight", FADE, RAIL_FADES)}>
            <span className="truncate text-[13px] font-medium">{me.data?.name || "Your account"}</span>
            <span className="truncate text-[12px] text-muted">{me.data?.email ?? " "}</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}
