import type { ReactNode } from "react";
import { READING } from "@/components/page";
import type { RouteTab } from "@/components/route-tabs";
import { cn } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH, INTEGRATIONS_MCP_PATH, INTEGRATIONS_PATH } from "@/lib/integrations";

/** The tabs of Integrations, in the order a new account needs them. */
export const INTEGRATION_TABS: RouteTab[] = [
  { href: INTEGRATIONS_PATH, label: "Chat apps", exact: true },
  { href: INTEGRATIONS_APPS_PATH, label: "Apps" },
  { href: INTEGRATIONS_MCP_PATH, label: "MCP servers", chip: "Max" },
];

/** What a tab is for, in a heading and a line or two, for someone who opens it for the first time. */
export function TabIntro({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        <p className={cn(READING, "text-[13.5px] text-muted")}>{children}</p>
      </div>
      {aside}
    </div>
  );
}
