"use client";

import { useEffect, useState } from "react";
import { ApiError, errorMessage, type App } from "@/lib/api/client";
import { useApps, useConnectApp } from "@/lib/api/hooks";
import { AppIcon } from "@/components/brand-icon";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Button, Card, ErrorState, Pill, SkeletonRows } from "@/components/ui";
import { openInNewTab } from "@/lib/navigate";
import { titleCase } from "@/lib/format";

const SHOWN = 6;

function connectError(error: unknown): string {
  if (error instanceof ApiError && (error.planLimit || error.status === 403)) {
    return "Your plan’s app limit is reached. Disconnect one or upgrade to add more.";
  }
  return errorMessage(error);
}

function isConnected(app: App): boolean {
  return app.connections.some((connection) => connection.status === "active");
}

/** Step 2: connect the first few apps. Each opens the app's own sign-in screen in the browser. */
export function StepApps({ onDone }: { onDone: () => void }) {
  const apps = useApps();
  const connect = useConnectApp();
  const [opened, setOpened] = useState<string | null>(null);

  // Signing in happens in the browser; look again when this window gets focus back.
  const refetch = apps.refetch;
  useEffect(() => {
    if (!opened) return;
    const refresh = () => void refetch();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [opened, refetch]);

  const shown = (apps.data ?? []).filter((app) => app.availableOnPlan).slice(0, SHOWN);
  const connectedCount = (apps.data ?? []).filter(isConnected).length;

  const start = (app: App) =>
    connect.mutate(
      { appSlug: app.slug, returnUrl: `${window.location.origin}/connected` },
      {
        onSuccess: ({ redirectUrl }) => {
          openInNewTab(redirectUrl);
          setOpened(app.slug);
        } },
    );

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Connect the apps Tex should work in</h1>
        <p className="max-w-[540px] text-[15px] text-muted">Start with one or two. You can add the rest any time from Apps.</p>
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
              const mine = connect.variables?.appSlug === app.slug;
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
                    <Button size="sm" pending={connect.isPending && mine} disabled={connect.isPending && !mine} onClick={() => start(app)} aria-label={`Connect ${app.name}`}>
                      Connect
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {connect.isError && (
        <p role="alert" className="text-[12.5px] text-danger">
          {connectError(connect.error)}
        </p>
      )}

      <p className="flex items-start gap-2.5 text-[13px] text-muted">
        <LockIcon size={16} className="mt-px shrink-0" />
        <span>Apps connect through their own sign-in screens. We never see your passwords, and access tokens are never handed to Tex.</span>
      </p>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="lg" onClick={onDone}>
          {connectedCount > 0 ? "Continue" : "Skip for now"}
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
