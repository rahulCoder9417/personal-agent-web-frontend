"use client";

import type { ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { nextRunLine, summarizeAutomations } from "@/lib/automations";
import { cn } from "@/lib/format";
import { AutomationsChatLink } from "./chat-link";

function Stat({ label, value, note, tone, className }: { label: string; value: ReactNode; note?: ReactNode; tone?: "danger"; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl border border-line bg-surface px-4 py-3", className)}>
      <span className="text-[12px] text-muted">{label}</span>
      <span className={cn("text-[15px] leading-snug font-semibold tabular-nums", tone === "danger" && "text-danger")}>{value}</span>
      {note && <span className="text-[12px] text-muted">{note}</span>}
    </div>
  );
}

/**
 * How the person's automations stand, at a glance: how many run, how many are paused (and how
 * many of those wait for them), what runs next, and the way to the results.
 */
export function AutomationsOverview({ automations }: { automations: readonly Automation[] }) {
  const { on, paused, needYou } = summarizeAutomations(automations);
  // "Next: Today’s meetings, tomorrow at 8:00 AM" → the part after "Next: ".
  const next = nextRunLine(automations).replace(/^Next: /, "");

  return (
    <section aria-label="Your automations at a glance" className="grid grid-cols-2 gap-2.5 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.3fr)_minmax(0,1.8fr)]">
      <Stat label="Running" value={on} note={on === 1 ? "automation is on" : "automations are on"} />
      <Stat
        label="Paused"
        value={paused}
        tone={needYou > 0 ? "danger" : undefined}
        note={needYou > 0 ? `${needYou} ${needYou === 1 ? "needs" : "need"} you: see below` : paused > 0 ? "until you resume" : "nothing paused"}
      />
      <Stat label="Up next" className="col-span-2 xl:col-span-1" value={<span className="line-clamp-2 text-[14px]">{next}</span>} />
      <AutomationsChatLink className="col-span-2 xl:col-span-1" />
    </section>
  );
}
