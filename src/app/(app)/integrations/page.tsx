"use client";

import { Suspense } from "react";
import { ChatAppsTab } from "@/components/integrations/chat-apps";
import { PageBody } from "@/components/page";
import { Card, SkeletonRows } from "@/components/ui";

/** Integrations → Chat apps. It reads `?link=` from the address, which needs a Suspense boundary. */
export default function ChatAppsPage() {
  return (
    <Suspense
      fallback={
        <PageBody>
          <Card>
            <SkeletonRows rows={3} />
          </Card>
        </PageBody>
      }
    >
      <ChatAppsTab />
    </Suspense>
  );
}
