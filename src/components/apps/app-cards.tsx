"use client";

import Link from "next/link";
import { useState } from "react";
import { AppIcon } from "@/components/brand-icon";
import { LockIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";
import { Button, Card, InlineError, Meta, Pill } from "@/components/ui";
import { ApiError, type App } from "@/lib/api/client";
import { useConnectApp, useDisconnectApp } from "@/lib/api/hooks";
import { leaveTo } from "@/lib/navigate";
import { titleCase } from "@/lib/format";

type Connection = App["connections"][number];

/**
 * Starting a connection: ask the API for the provider's sign-in URL, open it in the system
 * page, which returns to /apps when it is done.
 */
function useConnectFlow(appSlug: string) {
  const connect = useConnectApp();
  const [waiting, setWaiting] = useState(false);

  const start = () => {
    setWaiting(false);
    connect.mutate(
      { appSlug, returnUrl: `${window.location.origin}/apps?connected=${encodeURIComponent(appSlug)}` },
      {
        onSuccess: ({ redirectUrl }) => {
          // The provider's sign-in takes over this tab and returns to /apps when it's done.
          setWaiting(true);
          leaveTo(redirectUrl);
        } },
    );
  };

  return {
    start,
    pending: connect.isPending,
    waiting,
    error: connect.error,
    planLimit: connect.error instanceof ApiError && (connect.error.planLimit || connect.error.status === 403) };
}

type ConnectFlow = ReturnType<typeof useConnectFlow>;

/** What a card says after Connect was pressed: where to finish, or why it didn't start. */
function ConnectNotice({ flow }: { flow: ConnectFlow }) {
  if (flow.planLimit) {
    return (
      <p role="alert" className="text-[12.5px] text-danger">
        Your plan’s app limit is reached.{" "}
        <Link href="/settings/plans" className="font-medium text-accent hover:text-accent-dark">
          See plans
        </Link>
      </p>
    );
  }
  if (flow.error) return <InlineError error={flow.error} />;
  if (flow.waiting) {
    return (
      <p role="status" className="text-[12.5px] text-muted">
        Taking you to the sign-in screen…
      </p>
    );
  }
  return null;
}

function AppHeading({ app, tile = 40 }: { app: App; tile?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AppIcon name={app.slug} iconUrl={app.iconUrl} size={tile} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[14.5px] font-semibold">{app.name}</span>
        <Meta className="text-[12px]">{titleCase(app.category)}</Meta>
      </div>
    </div>
  );
}

function ConnectionRow({ app, connection, flow }: { app: App; connection: Connection; flow: ConnectFlow }) {
  const disconnect = useDisconnectApp();
  const label = connection.accountLabel || "Connected account";
  const healthy = connection.status === "active";

  return (
    <li className="flex flex-col gap-1">
      <div className="flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${healthy ? "bg-online" : "bg-danger"}`} />
        <span className="min-w-[96px] flex-1 truncate text-[13px]">{label}</span>
        {!healthy && (
          <>
            <Pill tone="danger">{connection.status === "expired" ? "Expired" : "Not working"}</Pill>
            <Button variant="primary" size="sm" className="h-7 px-3" pending={flow.pending} onClick={flow.start}>
              Reconnect
            </Button>
          </>
        )}
        <ConfirmButton
          label="Disconnect"
          confirmLabel="Disconnect"
          ariaLabel={`Disconnect ${app.name} ${label}`}
          pending={disconnect.isPending}
          onConfirm={() => disconnect.mutate(connection.id)}
        />
      </div>
      <InlineError error={disconnect.error} />
    </li>
  );
}

/** An app with at least one connected account. */
export function ConnectedAppCard({ app }: { app: App }) {
  const flow = useConnectFlow(app.slug);
  return (
    <Card className="flex flex-col gap-3.5 p-4">
      <div className="flex items-center justify-between gap-3">
        <AppHeading app={app} />
        <button
          type="button"
          disabled={flow.pending}
          onClick={flow.start}
          aria-label={`Add another ${app.name} account`}
          className="shrink-0 rounded px-1 text-[12.5px] font-medium text-accent hover:text-accent-dark disabled:opacity-50"
        >
          Add account
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {app.connections.map((connection) => (
          <ConnectionRow key={connection.id} app={app} connection={connection} flow={flow} />
        ))}
      </ul>
      <ConnectNotice flow={flow} />
    </Card>
  );
}

/** An app that isn't connected yet. */
export function AvailableAppCard({ app }: { app: App }) {
  const flow = useConnectFlow(app.slug);
  return (
    <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <AppHeading app={app} tile={38} />
        </div>
        {app.availableOnPlan ? (
          <Button size="sm" pending={flow.pending} onClick={flow.start} aria-label={`Connect ${app.name}`}>
            Connect
          </Button>
        ) : (
          <Link
            href="/settings/plans"
            className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-nav hover:bg-surface hover:text-fg"
            aria-label={`${app.name} isn’t on your plan. See plans`}
          >
            <LockIcon size={13} />
            Upgrade
          </Link>
        )}
      </div>
      <ConnectNotice flow={flow} />
    </div>
  );
}
