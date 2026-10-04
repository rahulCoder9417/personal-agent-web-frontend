import type { ReactNode } from "react";
import { Page, PageHeader } from "@/components/page";
import { RouteTabs } from "@/components/route-tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Page>
      <PageHeader title="Settings">
        <RouteTabs
          label="Settings sections"
          tabs={[
            { href: "/settings", label: "General", exact: true },
            { href: "/settings/agent", label: "Agent & AI" },
            { href: "/settings/memory", label: "Memory" },
            { href: "/settings/credits", label: "Credits" },
            { href: "/settings/plans", label: "Plans" },
          ]}
        />
      </PageHeader>
      {children}
    </Page>
  );
}
