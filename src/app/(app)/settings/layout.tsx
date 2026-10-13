import type { ReactNode } from "react";
import { Page, PageHeader } from "@/components/page";
import { RouteNav, RouteTabs, type RouteTab } from "@/components/route-tabs";

const SECTIONS: RouteTab[] = [
  { href: "/settings", label: "General", exact: true },
  { href: "/settings/agent", label: "Agent & AI" },
  { href: "/settings/memory", label: "Memory" },
  { href: "/settings/credits", label: "Credits" },
  { href: "/settings/plans", label: "Plans" },
];

/**
 * Settings: the sections in a column on the left from 1280px, and as tabs under the title below
 * that. The app's own sidebar already takes 236px from 768px; with a second column beside it any
 * earlier, Credits and Plans would be squeezed.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Page>
      <PageHeader title="Settings">
        <div className="max-w-full min-w-0 xl:hidden">
          <RouteTabs label="Settings sections" tabs={SECTIONS} />
        </div>
      </PageHeader>
      <div className="flex min-h-0 min-w-0 flex-1">
        <RouteNav label="Settings sections" tabs={SECTIONS} className="max-xl:hidden" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </Page>
  );
}
