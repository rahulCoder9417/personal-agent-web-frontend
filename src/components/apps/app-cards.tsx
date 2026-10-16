"use client";

import Link from "next/link";
import { useState } from "react";
import { AppIcon } from "@/components/brand-icon";
import { AutomationsIcon, LockIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast, toastError } from "@/components/toast";
import { Button, Card, Meta } from "@/components/ui";
import type { App } from "@/lib/api/client";
import { useAutomations, useDisconnectApp } from "@/lib/api/hooks";
import { cn, titleCase } from "@/lib/format";
import { connectedReturnPath } from "@/lib/integrations";
import { disconnectCopy, isConnectable, NOT_AVAILABLE_LABEL } from "./apps-logic";
import { useConnectDialog } from "./connect-dialog";
import { PRICING_PATH } from "@/lib/pricing";

type Connection = App["connections"][number];

/**
 * Connect, Add account and Reconnect open Textcrew's own connect screen first. Its Continue asks
 * the API for the sign-in link; the sign-in takes over this tab and comes back to Integrations →
 * Apps, where `ConnectedNotice` says how it went.
 */
function useConnectFlow() {
  return useConnectDialog({ returnPath: (app) => connectedReturnPath(app.slug) });
}

type ConnectFlow = ReturnType<typeof useConnectFlow>;

function AppHeading({ app, tile = 40, dim, accounts }: { app: App; tile?: number; dim?: boolean; accounts?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AppIcon name={app.slug} iconUrl={app.iconUrl} size={tile} className={dim ? "opacity-60" : undefined} />
      <div className="flex min-w-0 flex-col">
        <span className={cn("truncate text-[14.5px] font-semibold", dim && "text-nav")}>{app.name}</span>
        <Meta className="text-[12px]">
          {titleCase(app.category)}
          {accounts !== undefined && accounts > 1 && ` · ${accounts} accounts`}
        </Meta>
      </div>
    </div>
  );
}

/**
 * Before an account is disconnected: the app and the account, what stops working, and the
 * automations that watch the app when this is its last working account. Disconnecting is
 * `DELETE /v1/connections/{id}`; a toast says how it went, and once the catalog is asked for again
 * the app is back under "Add more" with its Connect button when no account is left.
 */
function DisconnectDialog({
  app,
  connection,
  disconnect,
  onClose,
}: {
  app: App;
  connection: Connection;
  disconnect: ReturnType<typeof useDisconnectApp>;
  onClose: () => void;
}) {
  const automations = useAutomations();
  const copy = disconnectCopy(app, connection, automations.data);
  const shown = copy.watching.slice(0, 4);

  return (
    <ConfirmDialog
      title={copy.title}
      icon={<AppIcon name={app.slug} iconUrl={app.iconUrl} size={44} />}
      confirmLabel={copy.confirmLabel}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await disconnect.mutateAsync(connection.id);
          toast(copy.done);
        } catch (error) {
          toastError(`Couldn’t disconnect ${app.name}`, error);
        }
      }}
    >
      <p>{copy.stops}</p>
      {shown.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-[12px] font-medium">
            {copy.watching.length === 1 ? `This automation watches ${app.name} and stops with it:` : `These automations watch ${app.name} and stop with it:`}
          </span>
          <ul className="flex flex-col gap-1 text-[13px] text-fg-2">
            {shown.map((automation) => (
              <li key={automation.id} className="flex items-center gap-2">
                <AutomationsIcon size={14} className="shrink-0 text-muted" />
                <span className="truncate">{automation.title}</span>
              </li>
            ))}
            {copy.watching.length > shown.length && <li className="text-muted">and {copy.watching.length - shown.length} more</li>}
          </ul>
        </div>
      )}
    </ConfirmDialog>
  );
}

const STATUS_LINE: Record<Connection["status"], string> = {
  active: "Connected",
  expired: "Sign-in expired. Reconnect so Tex can use it again.",
  error: "Not working. Reconnect, or disconnect it.",
};

/** One connected account: who it is, whether it works, and Reconnect (when it doesn't) and Disconnect. */
function ConnectionRow({ app, connection, flow }: { app: App; connection: Connection; flow: ConnectFlow }) {
  const [asking, setAsking] = useState(false);
  // Here rather than in the dialog, so the row's button shows the work too.
  const disconnect = useDisconnectApp();
  const label = connection.accountLabel || "Connected account";
  const healthy = connection.status === "active";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-[150px] flex-1 items-start gap-2.5">
        <span aria-hidden className={cn("mt-[7px] size-[7px] shrink-0 rounded-full", healthy ? "bg-online" : "bg-danger")} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-medium" title={label}>
            {label}
          </span>
          <span className={cn("text-[12px]", healthy ? "text-muted" : "text-danger")}>{STATUS_LINE[connection.status] ?? STATUS_LINE.error}</span>
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Reconnecting goes through the same sign-in, so it needs the app to be connectable. */}
        {!healthy && isConnectable(app) && (
          <Button variant="primary" size="sm" onClick={() => flow.open(app, "reconnect")} aria-label={`Reconnect ${app.name} ${label}`}>
            Reconnect
          </Button>
        )}
        <Button variant="danger-outline" size="sm" pending={disconnect.isPending} onClick={() => setAsking(true)} aria-label={`Disconnect ${app.name} ${label}`}>
          Disconnect
        </Button>
      </div>
      {asking && <DisconnectDialog app={app} connection={connection} disconnect={disconnect} onClose={() => setAsking(false)} />}
    </li>
  );
}

/** An app with at least one connected account. Each account has its own Disconnect. */
export function ConnectedAppCard({ app }: { app: App }) {
  const flow = useConnectFlow();
  const count = app.connections.length;
  return (
    <Card className="flex flex-col gap-3.5 p-4">
      <div className="flex items-center justify-between gap-3">
        <AppHeading app={app} accounts={count} />
        {isConnectable(app) && (
          <Button size="sm" onClick={() => flow.open(app, "add")} aria-label={`Add another ${app.name} account`}>
            Add account
          </Button>
        )}
      </div>
      <ul className="flex flex-col border-t border-line pt-3">
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
            href={PRICING_PATH}
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
