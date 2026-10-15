"use client";

import { AddMcpServerForm, McpLocked, McpServerRow } from "@/components/apps/mcp-servers";
import { PageBody } from "@/components/page";
import { Card, EmptyState, ErrorState, Meta, SectionLabel, SkeletonRows } from "@/components/ui";
import { useMcpServers, useMe, usePlans } from "@/lib/api/hooks";

export default function McpServersPage() {
  const me = useMe();
  const plans = usePlans();

  // The plan list says whether this plan includes custom servers; if it can't be read, only Max is assumed to.
  const plan = plans.data?.plans.find((p) => p.id === me.data?.plan);
  const allowed = me.data ? (plan ? plan.limits.ownMcpServers : me.data.plan === "max") : false;
  const ready = me.isSuccess && !plans.isPending;
  const servers = useMcpServers(ready && allowed);

  if (me.isError) {
    return (
      <PageBody>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </PageBody>
    );
  }
  if (!ready) {
    return (
      <PageBody>
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      </PageBody>
    );
  }
  if (!allowed) {
    return (
      <PageBody>
        <McpLocked />
      </PageBody>
    );
  }

  const list = servers.data ?? [];
  const on = list.filter((server) => server.enabled).length;

  return (
    <PageBody>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Plug your own tools into Tex</h2>
            <p className="max-w-xl text-[13.5px] text-muted">
              Add a server that speaks MCP and Tex can use its tools like any connected app. Risky actions still wait for your Approve.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <SectionLabel>Your servers</SectionLabel>
            {list.length > 0 && (
              <Meta className="text-[12px]">
                {on} of {list.length} on
              </Meta>
            )}
          </div>

          {servers.isPending ? (
            <Card>
              <SkeletonRows rows={2} />
            </Card>
          ) : servers.isError ? (
            <ErrorState error={servers.error} onRetry={() => void servers.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState title="No servers yet">Add your first one with the form. It shows up here with a switch to turn it on or off.</EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((server) => (
                <McpServerRow key={server.id} server={server} />
              ))}
            </div>
          )}

          <Meta className="text-[12px]">
            Tex runs in a sandbox that only reaches approved services. Removing a server takes its domain off the list.
          </Meta>
        </div>

        <AddMcpServerForm />
      </div>
    </PageBody>
  );
}
