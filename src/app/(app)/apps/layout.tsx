"use client";

import { Suspense, type ReactNode } from "react";
import { ConnectedNotice } from "@/components/apps/connected-notice";
import { Page, PageHeader } from "@/components/page";
import { RouteTabs } from "@/components/route-tabs";
import { Meta } from "@/components/ui";
import { useApps } from "@/lib/api/hooks";

export default function AppsLayout({ children }: { children: ReactNode }) {
  const apps = useApps();
  const connected = apps.data?.filter((app) => app.connections.length > 0).length;

  return (
    <Page>
      <PageHeader title="Apps">
        <RouteTabs
          label="Apps sections"
          tabs={[
            { href: "/apps", label: "App catalog", exact: true },
            { href: "/apps/mcp", label: "Your own MCP servers", chip: "Max" },
          ]}
        />
        {connected !== undefined && <Meta className="ml-auto whitespace-nowrap">{connected} connected</Meta>}
      </PageHeader>
      {/* Reads ?connected= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <ConnectedNotice />
      </Suspense>
      {children}
    </Page>
  );
}
