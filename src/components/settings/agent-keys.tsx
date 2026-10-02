"use client";

import { useId, useState, type FormEvent } from "react";
import { AppIcon } from "@/components/brand-icon";
import { Button, Card, ErrorState, Field, InlineError, inputClass, Meta, Pill, SectionLabel, SkeletonRows } from "@/components/ui";
import type { ByokKey, ByokProvider } from "@/lib/api/client";
import { useByokKeys, useDeleteByokKey, useSetByokKey } from "@/lib/api/hooks";
import { cn, formatDate } from "@/lib/format";
import { PROVIDER_LABEL, PROVIDERS } from "./agent-summary";
import { ConfirmButton } from "@/components/confirm-button";

const KEY_MIN = 10;

const HINTS: Record<ByokProvider, { key: string; model: string }> = {
  anthropic: { key: "sk-ant-…", model: "claude-sonnet-5-5" },
  openai: { key: "sk-…", model: "model id" },
  openrouter: { key: "sk-or-…", model: "provider/model" } };

function keyMeta(entry: ByokKey): string {
  if (!entry.set) return "No key added";
  return [
    entry.last4 ? `•••• ${entry.last4}` : "key saved",
    entry.model || null,
    entry.updatedAt ? `updated ${formatDate(entry.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function KeyForm({ entry, onDone }: { entry: ByokKey; onDone: () => void }) {
  const save = useSetByokKey();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(entry.model ?? "");
  const [tooShort, setTooShort] = useState(false);
  const id = useId();
  const hint = HINTS[entry.provider];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const key = apiKey.trim();
    if (key.length < KEY_MIN) {
      setTooShort(true);
      return;
    }
    save.mutate({ provider: entry.provider, apiKey: key, model: model.trim() || undefined }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl bg-chrome p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="API key" htmlFor={`${id}-key`} error={tooShort ? "That key looks too short." : null}>
          <input
            id={`${id}-key`}
            type="password"
            autoFocus
            autoComplete="off"
            value={apiKey}
            placeholder={hint.key}
            onChange={(event) => {
              setApiKey(event.target.value);
              setTooShort(false);
            }}
            className={cn(inputClass, "font-mono text-[12.5px]")}
          />
        </Field>
        <Field
          label={
            <>
              Preferred model <span className="font-normal text-muted">(optional)</span>
            </>
          }
          htmlFor={`${id}-model`}
        >
          <input
            id={`${id}-model`}
            autoComplete="off"
            spellCheck={false}
            value={model}
            placeholder={hint.model}
            onChange={(event) => setModel(event.target.value)}
            className={cn(inputClass, "font-mono text-[12.5px]")}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="submit" variant="primary" pending={save.isPending}>
          Test and save
        </Button>
        <Button onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <span className="text-[12.5px] text-muted">We make one test call before saving. Your provider bills the AI directly.</span>
      </div>
      <InlineError error={save.error} />
    </form>
  );
}

function KeyRow({ entry }: { entry: ByokKey }) {
  const remove = useDeleteByokKey();
  const [editing, setEditing] = useState(false);
  const name = PROVIDER_LABEL[entry.provider];

  return (
    <li className="flex flex-col gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <AppIcon name={entry.provider} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold">{name}</span>
          <Meta className="truncate">{keyMeta(entry)}</Meta>
        </div>
        {entry.set ? (
          <>
            <Pill tone="done">Key saved</Pill>
            {!editing && (
              <Button size="sm" onClick={() => setEditing(true)} aria-label={`Replace ${name} key`}>
                Replace
              </Button>
            )}
            <ConfirmButton
              label="Remove"
              confirmLabel="Remove key"
              ariaLabel={`Remove ${name} key`}
              pending={remove.isPending}
              onConfirm={() => remove.mutate(entry.provider)}
            />
          </>
        ) : (
          !editing && (
            <Button size="sm" onClick={() => setEditing(true)} aria-label={`Add ${name} key`}>
              Add key
            </Button>
          )
        )}
      </div>
      {editing && <KeyForm entry={entry} onDone={() => setEditing(false)} />}
      <InlineError error={remove.error} />
    </li>
  );
}

/** Bring-your-own-key: one row per provider. Keys are write-only; only the last four characters come back. */
export function ApiKeysSection() {
  const keys = useByokKeys();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <SectionLabel>Your API keys</SectionLabel>
        <span className="text-[12.5px] text-muted">Encrypted. Only the last 4 characters are ever shown.</span>
      </div>
      {keys.isPending ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : keys.isError ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : (
        <Card>
          <ul>
            {PROVIDERS.map((provider) => (
              <KeyRow key={provider} entry={keys.data.find((key) => key.provider === provider) ?? { provider, set: false }} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
