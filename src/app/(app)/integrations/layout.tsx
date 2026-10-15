"use client";

import { Suspense, type ReactNode } from "react";
import { ConnectedNotice } from "@/components/apps/connected-notice";
import { INTEGRATION_TABS } from "@/components/integrations/intro";
import { Page, PageHeader } from "@/components/page";
import { RouteTabs } from "@/components/route-tabs";

/**
 * Integrations: everything the person connects, in three tabs. The chat apps they text Tex from
 * (Telegram, linked with a one-time code), the apps Tex works in (the catalog and its connect
 * screens) and their own MCP servers (Max).
 */
export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <Page>
      <PageHeader title="Integrations">
        <div className="max-w-full min-w-0">
          <RouteTabs label="Integrations sections" tabs={INTEGRATION_TABS} />
        </div>
      </PageHeader>
      {/* Reads ?connected= from the URL after an app's sign-in, which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <ConnectedNotice />
      </Suspense>
      {children}
    </Page>
  );
}
