"use client";

import Link from "next/link";
import { AppIcon } from "@/components/brand-icon";
import { LockIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";
import { toastError } from "@/components/toast";
import { Button, Card, Meta, Pill } from "@/components/ui";
import type { App } from "@/lib/api/client";
import { useDisconnectApp } from "@/lib/api/hooks";
import { cn, titleCase } from "@/lib/format";
import { isConnectable, NOT_AVAILABLE_LABEL } from "./apps-logic";
import { useConnectDialog } from "./connect-dialog";

type Connection = App["connections"][number];

/**
 * Connect, Add account and Reconnect open Textcrew's own connect screen first. Its Continue asks
 * the API for the sign-in link; the sign-in takes over this tab and comes back to /apps, where
 * `ConnectedNotice` says how it went.
 */
function useConnectFlow() {
  return useConnectDialog({ returnPath: (app) => `/apps?connected=${encodeURIComponent(app.slug)}` });
}

type ConnectFlow = ReturnType<typeof useConnectFlow>;

function AppHeading({ app, tile = 40, dim }: { app: App; tile?: number; dim?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AppIcon name={app.slug} iconUrl={app.iconUrl} size={tile} className={dim ? "opacity-60" : undefined} />
      <div className="flex min-w-0 flex-col">
        <span className={cn("truncate text-[14.5px] font-semibold", dim && "text-nav")}>{app.name}</span>
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
    <li className="flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1">
      <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${healthy ? "bg-online" : "bg-danger"}`} />
      <span className="min-w-[96px] flex-1 truncate text-[13px]">{label}</span>
      {!healthy && (
        <>
          <Pill tone="danger">{connection.status === "expired" ? "Expired" : "Not working"}</Pill>
          {/* Reconnecting goes through the same sign-in, so it needs the app to be connectable. */}
          {isConnectable(app) && (
            <Button variant="primary" size="sm" className="h-7 px-3" onClick={() => flow.open(app, "reconnect")} aria-label={`Reconnect ${app.name} ${label}`}>
              Reconnect
            </Button>
          )}
        </>
      )}
      <ConfirmButton
        label="Disconnect"
        confirmLabel="Disconnect"
        ariaLabel={`Disconnect ${app.name} ${label}`}
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate(connection.id, { onError: (error) => toastError(`Couldn’t disconnect ${app.name}`, error) })}
      />
    </li>
  );
}

/** An app with at least one connected account. */
export function ConnectedAppCard({ app }: { app: App }) {
  const flow = useConnectFlow();
  return (
    <Card className="flex flex-col gap-3.5 p-4">
      <div className="flex items-center justify-between gap-3">
        <AppHeading app={app} />
        {isConnectable(app) && (
          <button
            type="button"
            onClick={() => flow.open(app, "add")}
            aria-label={`Add another ${app.name} account`}
            className="shrink-0 rounded px-1 text-[12.5px] font-medium text-accent hover:text-accent-dark disabled:opacity-50"
          >
            Add account
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {app.connections.map((connection) => (
          <ConnectionRow key={connection.id} app={app} connection={connection} flow={flow} />
        ))}
      </ul>
      {flow.dialog}
    </Card>
  );
}

/** An app that isn't connected yet: Connect, the way to a plan that has it, or "Not available yet". */
export function AvailableAppCard({ app }: { app: App }) {
  const flow = useConnectFlow();
  const connectable = isConnectable(app);
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl px-3 py-2.5 transition-colors", connectable && "hover:bg-surface-2")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <AppHeading app={app} tile={38} dim={!connectable} />
        </div>
        {!connectable ? (
          // The server has no setup for this app yet, so there is nothing to press.
          <span className="shrink-0 px-1 text-[12.5px] text-muted">{NOT_AVAILABLE_LABEL}</span>
        ) : app.availableOnPlan ? (
          <Button size="sm" onClick={() => flow.open(app)} aria-label={`Connect ${app.name}`}>
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
      {flow.dialog}
    </div>
  );
}
