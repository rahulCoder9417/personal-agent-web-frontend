"use client";

import { useId, useState, type FormEvent } from "react";
import { LockIcon, WarningIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast, toastError } from "@/components/toast";
import { Button, ButtonLink, Card, Field, IconTile, inputClass, Meta, Pill, Switch } from "@/components/ui";
import type { McpServer } from "@/lib/api/client";
import { useCreateMcpServer, useDeleteMcpServer, useUpdateMcpServer } from "@/lib/api/hooks";
import { cn, formatDate } from "@/lib/format";
import {
  MCP_NAME_MAX,
  toMcpServerCreate,
  validateMcpServer,
  type McpServerDraft,
  type McpServerErrors,
} from "./apps-logic";

function ServerGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="4" width="17" height="7" rx="2" />
      <rect x="3.5" y="13" width="17" height="7" rx="2" />
      <path d="M7.5 7.5h.01M7.5 16.5h.01" />
    </svg>
  );
}

/** Shown instead of the list when the plan doesn't include custom tool servers. */
export function McpLocked() {
  return (
    <Card className="mx-auto flex max-w-xl flex-col items-center gap-3 px-8 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-nav">
        <LockIcon size={22} />
      </span>
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Your own MCP servers are part of Max</h2>
      <p className="max-w-md text-[13.5px] text-muted">
        On Max you can add a server that speaks MCP, and Tex uses its tools like any connected app. Risky actions still wait for your Approve.
      </p>
      <ButtonLink href="/settings/plans" variant="primary" className="mt-2">
        See Max
      </ButtonLink>
    </Card>
  );
}

export function McpServerRow({ server }: { server: McpServer }) {
  const update = useUpdateMcpServer();
  const remove = useDeleteMcpServer();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState(server.name);
  const renameId = useId();

  const trimmed = name.trim();
  const canRename = trimmed.length > 0 && trimmed.length <= MCP_NAME_MAX && trimmed !== server.name;
  const toggling = update.isPending && update.variables?.enabled !== undefined;
  // Show the switch where it's heading while the request is in flight.
  const enabled = toggling ? Boolean(update.variables?.enabled) : server.enabled;

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    if (!canRename) return;
    update.mutate(
      { mcpServerId: server.id, name: trimmed },
      { onSuccess: () => setRenaming(false), onError: (error) => toastError(`Couldn’t rename ${server.name}`, error) },
    );
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <IconTile size={38} className="text-nav">
          <ServerGlyph />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col">
          {renaming ? (
            <form onSubmit={saveName} className="flex items-center gap-2">
              <label htmlFor={renameId} className="sr-only">
                Server name
              </label>
              <input
                id={renameId}
                autoFocus
                value={name}
                maxLength={MCP_NAME_MAX}
                onChange={(event) => setName(event.target.value)}
                className={cn(inputClass, "h-8 max-w-64")}
              />
              <Button type="submit" size="sm" variant="primary" disabled={!canRename} pending={update.isPending && !toggling}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRenaming(false);
                  setName(server.name);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate text-[14.5px] font-semibold">{server.name}</span>
              {server.lastError ? <Pill tone="danger">Needs attention</Pill> : enabled ? <Pill tone="done">On</Pill> : <Pill>Off</Pill>}
            </div>
          )}
          <Meta className="truncate font-mono text-[12px]">{server.url}</Meta>
        </div>
        <Switch
          on={enabled}
          disabled={update.isPending}
          label={`${enabled ? "Turn off" : "Turn on"} ${server.name}`}
          onToggle={() =>
            update.mutate(
              { mcpServerId: server.id, enabled: !enabled },
              { onError: (error) => toastError(`Couldn’t turn ${server.name} ${enabled ? "off" : "on"}`, error) },
            )
          }
        />
      </div>

      {server.lastError && (
        <p className="flex items-start gap-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          <WarningIcon size={15} className="mt-px shrink-0" />
          <span>{server.lastError}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-surface-2 pt-2.5">
        <Meta className="flex items-center gap-1.5 text-[12px]">
          <LockIcon size={13} />
          {server.hasSecret ? "secret saved" : "no secret"} · added {formatDate(server.createdAt)}
        </Meta>
        <div className="flex items-center gap-2">
          {!renaming && (
            <Button size="sm" variant="ghost" onClick={() => setRenaming(true)} aria-label={`Rename ${server.name}`}>
              Rename
            </Button>
          )}
          <Button size="sm" variant="danger-outline" pending={remove.isPending} onClick={() => setRemoving(true)} aria-label={`Remove ${server.name}`}>
            Remove
          </Button>
          {removing && (
            <ConfirmDialog
              title={`Remove ${server.name}?`}
              icon={
                <IconTile size={44} className="text-nav">
                  <ServerGlyph />
                </IconTile>
              }
              confirmLabel="Remove server"
              onClose={() => setRemoving(false)}
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(server.id);
                  toast({ title: `${server.name} removed`, body: "Tex can no longer use its tools, and its domain is off your agent’s allowlist." });
                } catch (error) {
                  toastError(`Couldn’t remove ${server.name}`, error);
                }
              }}
            >
              <p>Tex can no longer use its tools, its saved secret is deleted, and its domain comes off your agent’s allowlist.</p>
            </ConfirmDialog>
          )}
        </div>
      </div>
    </Card>
  );
}

const EMPTY_DRAFT: McpServerDraft = { name: "", url: "", authHeaderName: "", authSecret: "" };

export function AddMcpServerForm() {
  const create = useCreateMcpServer();
  const [draft, setDraft] = useState<McpServerDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<McpServerErrors>({});
  const id = useId();

  const set = (field: keyof McpServerDraft) => (event: { target: { value: string } }) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateMcpServer(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // What the form can check is said under the fields; a refusal from the server is a toast.
    create.mutate(toMcpServerCreate(draft), {
      onSuccess: () => setDraft(EMPTY_DRAFT),
      onError: (error) => toastError("Couldn’t add the server", error),
    });
  };

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="text-[15px] font-semibold">
          Add a server
        </h2>
        <Field label="Name" htmlFor={`${id}-name`} error={errors.name}>
          <input id={`${id}-name`} value={draft.name} onChange={set("name")} maxLength={MCP_NAME_MAX} placeholder="Support desk" className={inputClass} />
        </Field>
        <Field label="Server URL" htmlFor={`${id}-url`} hint="Must be https." error={errors.url}>
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            value={draft.url}
            onChange={set("url")}
            placeholder="https://"
            autoComplete="off"
            spellCheck={false}
            className={cn(inputClass, "font-mono text-[12.5px]")}
          />
        </Field>
        <Field
          label={
            <>
              Auth header name <span className="font-normal text-muted">(optional)</span>
            </>
          }
          htmlFor={`${id}-header`}
        >
          <input
            id={`${id}-header`}
            value={draft.authHeaderName}
            onChange={set("authHeaderName")}
            placeholder="Authorization"
            autoComplete="off"
            spellCheck={false}
            className={cn(inputClass, "font-mono text-[12.5px]")}
          />
        </Field>
        <Field
          label={
            <>
              Secret <span className="font-normal text-muted">(optional)</span>
            </>
          }
          htmlFor={`${id}-secret`}
          hint="Encrypted, never shown again."
          error={errors.authSecret}
        >
          <input
            id={`${id}-secret`}
            type="password"
            value={draft.authSecret}
            onChange={set("authSecret")}
            placeholder="Paste the token"
            autoComplete="off"
            className={cn(inputClass, "font-mono text-[12.5px]")}
          />
        </Field>
        <p className="flex items-start gap-2 text-[12.5px] text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" aria-hidden className="mt-px shrink-0">
            <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3Z" />
          </svg>
          <span>The server’s domain is added to your agent’s allowlist, so Tex can reach it and nothing else new.</span>
        </p>
        <Button type="submit" variant="primary" pending={create.isPending}>
          Add server
        </Button>
      </form>
    </Card>
  );
}
