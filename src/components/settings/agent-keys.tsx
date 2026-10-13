"use client";

import { useId, useState, type FormEvent } from "react";
import { KeyIcon } from "@/components/icons";
import { toastError } from "@/components/toast";
import { Button, ErrorState, Field, IconTile, inputClass, Meta, Pill, SkeletonRows } from "@/components/ui";
import { refusedTypedValue } from "@/lib/action-errors";
import type { ByokKey, ByokProvider } from "@/lib/api/client";
import { useByokKeys, useDeleteByokKey, useSetByokKey } from "@/lib/api/hooks";
import { cn, formatDate, listNames } from "@/lib/format";
import { CHOICE_TAG, ChoiceCard } from "./agent-choice";
import { PROVIDER_LABEL, PROVIDERS, type AiChoiceState } from "./agent-summary";
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
    entry.effectiveModel || entry.model || null,
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
    save.mutate(
      { provider: entry.provider, apiKey: key, model: model.trim() || undefined },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (!refusedTypedValue(error)) toastError(`Couldn’t save your ${PROVIDER_LABEL[entry.provider]} key`, error);
        },
      },
    );
  };

  // The provider's verdict on the key (the test call) is said under the field; anything else is a toast.
  const refused = refusedTypedValue(save.error) ? save.error.message : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl bg-chrome p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="API key" htmlFor={`${id}-key`} error={tooShort ? "That key looks too short." : refused}>
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
              if (save.isError) save.reset();
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
    </form>
  );
}

function KeyRow({ entry }: { entry: ByokKey }) {
  const remove = useDeleteByokKey();
  const [editing, setEditing] = useState(false);
  const name = PROVIDER_LABEL[entry.provider];

  return (
    <li className="flex flex-col gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Providers are named in plain text; no logos. */}
        <IconTile size={36} className="text-nav">
          <KeyIcon size={17} />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold">{name}</span>
          <Meta className="truncate">{keyMeta(entry)}</Meta>
        </div>
        {entry.set ? (
          // On a phone the actions go on a line of their own, under the key's name.
          <div className="flex items-center gap-2 max-sm:w-full max-sm:pl-12">
            {entry.inUse ? <Pill tone="done">In use</Pill> : <Pill tone="muted">Saved</Pill>}
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
              onConfirm={() => remove.mutate(entry.provider, { onError: (error) => toastError(`Couldn’t remove your ${name} key`, error) })}
            />
          </div>
        ) : (
          !editing && (
            <Button size="sm" onClick={() => setEditing(true)} aria-label={`Add ${name} key`}>
              Add key
            </Button>
          )
        )}
      </div>
      {editing && <KeyForm entry={entry} onDone={() => setEditing(false)} />}
    </li>
  );
}

/** The first way to get AI: your own key, one row per provider. Keys are write-only; only the last four characters come back. */
export function ApiKeysSection({ state }: { state: AiChoiceState }) {
  const keys = useByokKeys();

  return (
    <ChoiceCard
      title="Your own API key"
      tag={CHOICE_TAG.own_key}
      state={state}
      description={
        <>
          From {listNames(PROVIDERS.map((provider) => PROVIDER_LABEL[provider]))}. Your provider bills the AI directly, so the AI isn’t charged in
          credits. Keys are encrypted, and only the last 4 characters are ever shown.
        </>
      }
    >
      {keys.isPending ? (
        <SkeletonRows rows={3} />
      ) : keys.isError ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : (
        <ul>
          {PROVIDERS.map((provider) => (
            <KeyRow key={provider} entry={keys.data.find((key) => key.provider === provider) ?? { provider, set: false, inUse: false, effectiveModel: "" }} />
          ))}
        </ul>
      )}
    </ChoiceCard>
  );
}
