"use client";

import { useId, useState, type FormEvent } from "react";
import type { ByokProvider } from "@/lib/api/client";
import { useAgentSettings, useSetByokKey } from "@/lib/api/hooks";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Button, Card, ErrorState, Field, InlineError, inputClass } from "@/components/ui";
import { cn } from "@/lib/format";

const PROVIDERS: { id: ByokProvider; label: string; placeholder: string }[] = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-…" },
];

const PROVIDER_LABEL: Record<ByokProvider, string> = { anthropic: "Anthropic", openai: "OpenAI", openrouter: "OpenRouter" };

/** Step 3: Tex runs on the user's own AI key, so the provider bills the AI and credits don't. */
export function StepKey({ onDone }: { onDone: () => void }) {
  const id = useId();
  const settings = useAgentSettings();
  const save = useSetByokKey();
  const [provider, setProvider] = useState<ByokProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");

  const current = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const tooShort = apiKey.trim().length > 0 && apiKey.trim().length < 10;
  const existing = settings.data
    ? [
        ...(settings.data.claude.connected ? ["your Claude plan"] : []),
        ...settings.data.ownKeyProviders.map((p) => `your ${PROVIDER_LABEL[p]} key`),
      ]
    : [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = apiKey.trim();
    if (value.length < 10 || save.isPending) return;
    save.mutate(
      { provider, apiKey: value },
      {
        onSuccess: () => {
          setApiKey("");
          onDone();
        },
      },
    );
  };

  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Add your AI key</h1>
        <p className="max-w-[540px] text-[15px] text-muted">
          Tex thinks with your own Anthropic, OpenAI or OpenRouter key. Your provider bills the AI directly, so it isn’t charged in credits.
        </p>
      </div>

      {settings.isError && <ErrorState error={settings.error} onRetry={() => settings.refetch()} className="py-6" />}

      {existing.length > 0 && (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-[13.5px] text-success">
          <CheckIcon size={16} className="shrink-0" />
          <span className="flex-1">Tex can already run on {existing.join(" and ")}. Add another key, or carry on.</span>
          <Button size="sm" onClick={onDone}>
            Continue
          </Button>
        </div>
      )}

      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Provider" htmlFor={`${id}-provider`}>
            <select
              id={`${id}-provider`}
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as ByokProvider);
                save.reset();
              }}
              className={cn(inputClass, "appearance-auto pr-2")}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="API key"
            htmlFor={`${id}-key`}
            error={tooShort ? "That looks too short to be a key." : null}
            hint="We make one test call before saving."
          >
            <input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={current.placeholder}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (save.isError) save.reset();
              }}
              className={cn(inputClass, "text-[13px]")}
            />
          </Field>

          <InlineError error={save.error} />

          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="submit" variant="primary" size="lg" pending={save.isPending} disabled={apiKey.trim().length < 10}>
              Test and save
            </Button>
            <Button size="lg" variant="ghost" onClick={onDone} disabled={save.isPending}>
              Skip for now
            </Button>
          </div>
        </form>
      </Card>

      <p className="flex items-start gap-2.5 text-[13px] text-muted">
        <LockIcon size={16} className="mt-px shrink-0" />
        <span>Your key is encrypted and never shown again; only the last 4 characters appear in settings. You can also connect a Claude plan later under Agent &amp; AI.</span>
      </p>
    </div>
  );
}
