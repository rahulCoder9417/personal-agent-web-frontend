"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ActivityIcon, ChevronRightIcon, CrewIcon, SettingsIcon } from "@/components/icons";
import { Page, PageBody, PageHeader } from "@/components/page";
import { AgentFigure } from "@/components/tex";
import { useAgentSettings, useChannels, useCrew, useMe, useMemories, usePlans } from "@/lib/api/hooks";
import { crewNavNote } from "@/lib/crew";
import { CHANNEL_LABEL, formatNumber, initials } from "@/lib/format";

function Row({ href, icon, title, detail }: { href: string; icon: ReactNode; title: string; detail?: string }) {
  return (
    <Link href={href} className="flex min-h-[52px] items-center gap-3 border-b border-line px-1 last:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-nav">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{title}</span>
      {detail && <span className="max-w-[45%] truncate text-[13px] text-muted tabular-nums">{detail}</span>}
      <ChevronRightIcon size={15} className="shrink-0 text-muted" />
    </Link>
  );
}

const glyph = (text: string) => <span className="text-[12px] font-semibold">{text}</span>;

const AI_SOURCE: Record<string, string> = {
  claude_plan: "Your Claude plan",
  own_key: "Your own key",
  platform: "Textcrew AI",
  none: "Not set up",
};

/** Phone only: everything that doesn't fit in the five tabs. On a wide screen the sidebar covers it. */
export default function MorePage() {
  const me = useMe();
  const plans = usePlans();
  const channels = useChannels();
  const agent = useAgentSettings();
  const crew = useCrew();
  const memories = useMemories();
  const plan = plans.data?.plans.find((p) => p.id === me.data?.plan);
  const linked = (channels.data ?? []).filter((c) => c.channel !== "web").map((c) => CHANNEL_LABEL[c.channel]);

  return (
    <Page>
      <PageHeader title="More" />
      <PageBody width={560} className="gap-5">
        <Link href="/settings" className="flex items-center gap-3.5 rounded-2xl bg-surface-2 px-4 py-3.5">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-fg text-[14px] font-semibold text-white">
            {me.data ? initials(me.data.name || me.data.email) : ""}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold">{me.data?.name || "Your account"}</span>
            <span className="truncate text-[13px] text-muted">{me.data?.email ?? " "}</span>
          </span>
          {plan && <span className="rounded bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent-dark">{plan.name}</span>}
        </Link>

        <div className="flex flex-col">
          <Row href="/activity" icon={<ActivityIcon size={17} />} title="Activity log" />
          <Row href="/settings/credits" icon={glyph("¢")} title="Credits" detail={me.data ? formatNumber(me.data.credits.balance) : undefined} />
          <Row href="/settings/plans" icon={glyph("$")} title="Plans and billing" detail={plan?.name} />
          <Row
            href="/settings/agent"
            icon={<AgentFigure who="tex" glyph size={20} label="" />}
            title="Agent and AI"
            detail={agent.data ? AI_SOURCE[agent.data.aiAccess] : undefined}
          />
          <Row
            href="/settings/memory"
            icon={glyph("M")}
            title="Memory"
            detail={memories.data ? `${formatNumber(memories.data.items.length)} saved` : undefined}
          />
          <Row href="/settings" icon={<SettingsIcon size={17} />} title="Settings" detail={linked.length ? linked.join(", ") : "No chat linked"} />
          <Row href="/crew" icon={<CrewIcon size={17} />} title="Crew" detail={crewNavNote(crew.data)} />
        </div>
      </PageBody>
    </Page>
  );
}
