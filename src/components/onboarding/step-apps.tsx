"use client";

import { useEffect, useState } from "react";
import type { App } from "@/lib/api/client";
import { useApps } from "@/lib/api/hooks";
import { appsToOffer } from "@/components/apps/apps-logic";
import { useConnectDialog } from "@/components/apps/connect-dialog";
import { AppIcon } from "@/components/brand-icon";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Button, Card, ErrorState, Pill, SkeletonRows } from "@/components/ui";
import { titleCase } from "@/lib/format";

const SHOWN = 6;

function isConnected(app: App): boolean {
  return app.connections.some((connection) => connection.status === "active");
}

/**
 * Step 2: connect the first few apps. Connect shows Textcrew's own connect screen; its Continue
 * opens the app's sign-in in a new tab, which comes back to /connected, so this flow stays put.
 */
export function StepApps({ onDone, continueLabel = "Continue" }: { onDone: () => void; continueLabel?: string }) {
  const apps = useApps();
  const [opened, setOpened] = useState<string | null>(null);
  const connect = useConnectDialog({
    returnPath: (app) => `/connected?app=${encodeURIComponent(app.slug)}`,
    newTab: true,
    onOpened: setOpened,
  });

  // Signing in happens in the browser; look again when this window gets focus back.
  const refetch = apps.refetch;
  useEffect(() => {
    if (!opened) return;
    const refresh = () => void refetch();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [opened, refetch]);

  // Only apps that can be connected right now: on the plan, and set up on the server.
  const shown = appsToOffer(apps.data ?? [], SHOWN);
  const connectedCount = (apps.data ?? []).filter(isConnected).length;

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Connect the apps Tex should work in</h1>
        <p className="max-w-[560px] text-[15px] text-muted">
          Tex reads, searches and drafts in the apps you connect, and asks you before it sends or changes anything. Start with one; you can add
          the rest any time from Apps.
        </p>
      </div>

      {apps.isPending ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : apps.isError ? (
        <ErrorState error={apps.error} onRetry={() => apps.refetch()} />
      ) : shown.length === 0 ? (
        <p className="text-[14px] text-muted">No apps are available to connect yet.</p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="flex flex-col">
            {shown.map((app) => {
              const connected = isConnected(app);
              const account = app.connections.find((c) => c.status === "active")?.accountLabel;
              return (
                <li key={app.slug} className="flex items-center gap-3.5 border-b border-line px-5 py-3.5 last:border-b-0">
                  <AppIcon name={app.slug} iconUrl={app.iconUrl} size={38} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14.5px] font-semibold">{app.name}</span>
                    <span className="truncate text-[12px] text-muted">
                      {connected && account ? account : titleCase(app.category)}
                      {opened === app.slug && !connected && " · finish signing in in the new tab"}
                    </span>
                  </div>
                  {connected ? (
                    <Pill tone="done" className="gap-1">
                      <CheckIcon size={12} />
                      Connected
                    </Pill>
                  ) : (
                    <Button size="sm" onClick={() => connect.open(app)} aria-label={`Connect ${app.name}`}>
                      Connect
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {connect.dialog}

      <p className="flex items-start gap-2.5 text-[13px] text-muted">
        <LockIcon size={16} className="mt-px shrink-0" />
        <span>Apps connect through their own sign-in screens. We never see your passwords, and access tokens are never handed to Tex.</span>
      </p>

      <div className="flex items-center gap-3">
        <Button variant={connectedCount > 0 ? "primary" : "secondary"} size="lg" onClick={onDone}>
          {connectedCount > 0 ? continueLabel : "Skip for now"}
        </Button>
        {connectedCount > 0 && (
          <span className="text-[12px] text-muted">
            {connectedCount} connected
          </span>
        )}
      </div>
    </div>
  );
}
