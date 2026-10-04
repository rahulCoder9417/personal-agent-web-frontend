"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { AgentSettings, ByokProvider } from "@/lib/api/client";
import { useAgentSettings, useSetByokKey, useUpdateAgentSettings } from "@/lib/api/hooks";
import { CheckIcon, LockIcon } from "@/components/icons";
import { CHOICE_TAG, ChoiceStatePill } from "@/components/settings/agent-choice";
import { CLAUDE_SIGN_IN_NOTE, ClaudeConnectSteps } from "@/components/settings/agent-claude";
import {
  describeAiChoices,
  PROVIDER_LABEL,
  PROVIDERS,
  textcrewAiOffer,
  type AiChoice,
  type AiChoiceState,
} from "@/components/settings/agent-summary";
import { Button, Card, ErrorState, Field, InlineError, inputClass, SkeletonRows } from "@/components/ui";
import { cn, listNames } from "@/lib/format";

const KEY_PLACEHOLDER: Record<ByokProvider, string> = { anthropic: "sk-ant-…", openai: "sk-…", openrouter: "sk-or-…" };

const CHOICES: { id: AiChoice; title: string; body: string }[] = [
  {
    id: "own_key",
    title: "Your own API key",
    body: `From ${listNames(PROVIDERS.map((provider) => PROVIDER_LABEL[provider]))}. Your provider bills the AI, so it isn’t charged in credits.`,
  },
  { id: "claude_plan", title: "Your Claude plan", body: "Runs Claude Code in your private workspace, on the plan you already pay for." },
  { id: "textcrew", title: "Textcrew AI", body: "Nothing to set up. The AI is paid in credits." },
];

function ChoiceOption({
  title,
  body,
  tag,
  state,
  checked,
  onPick,
}: {
  title: string;
  body: string;
  tag: ReactNode;
  state: AiChoiceState;
  checked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onPick}
      className={cn(
        "flex items-start gap-3.5 rounded-xl border bg-surface px-4 py-3.5 text-left transition-colors",
        checked ? "border-fg-2 shadow-[0_0_0_1px_var(--fg-2)]" : "border-line hover:border-fg/40",
      )}
    >
      <span aria-hidden className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]", checked ? "border-fg" : "border-line-strong")}>
        <span className={cn("size-2 rounded-full", checked ? "bg-fg" : "bg-transparent")} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">
          {title}
          {tag}
          <ChoiceStatePill state={state} />
        </span>
        <span className="text-[13px] text-muted">{body}</span>
      </span>
    </button>
  );
}

function KeyForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const save = useSetByokKey();
  const [provider, setProvider] = useState<ByokProvider>(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState("");
  const tooShort = apiKey.trim().length > 0 && apiKey.trim().length < 10;

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
          {PROVIDERS.map((option) => (
            <option key={option} value={option}>
              {PROVIDER_LABEL[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="API key"
        htmlFor={`${id}-key`}
        error={tooShort ? "That looks too short to be a key." : null}
        hint="We make one test call before saving. The key is encrypted and never shown again; only its last 4 characters appear in settings."
      >
        <input
          id={`${id}-key`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={KEY_PLACEHOLDER[provider]}
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
            if (save.isError) save.reset();
          }}
          className={cn(inputClass, "text-[13px]")}
        />
      </Field>

      <InlineError error={save.error} />

      <Button type="submit" variant="primary" size="lg" className="self-start" pending={save.isPending} disabled={apiKey.trim().length < 10}>
        Test and save
      </Button>
    </form>
  );
}

function ClaudePanel({ connected, onDone }: { connected: boolean; onDone: () => void }) {
  if (connected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[200px] flex-1 text-[14px]">Your Claude plan is connected.</p>
        <Button variant="primary" size="lg" onClick={onDone}>
          Continue
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ClaudeConnectSteps />
      <p className="border-t border-line pt-4 text-[13px] text-muted">{CLAUDE_SIGN_IN_NOTE}</p>
    </div>
  );
}

function TextcrewPanel({ settings, onDone }: { settings: AgentSettings; onDone: () => void }) {
  const update = useUpdateAgentSettings();
  const offer = textcrewAiOffer(settings);

  if (!settings.platformAvailable) {
    return (
      <p className="text-[14px] text-muted">
        Textcrew AI isn’t available on this account right now. Tex needs your own API key or your Claude plan to work.
      </p>
    );
  }
  // Tex is on the person's own AI: Textcrew AI can be chosen over it.
  if (offer?.action === "choose") {
    return (
      <div className="flex flex-col items-start gap-3.5">
        <p className="text-[14px]">
          Tex is on your own AI now, so the AI isn’t charged in credits. Use Textcrew AI instead and the AI is paid in credits. What you set up stays
          saved, so you can go back under Agent &amp; AI.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" size="lg" pending={update.isPending} onClick={() => update.mutate(offer.patch, { onSuccess: onDone })}>
            Use Textcrew AI
          </Button>
          <Button variant="ghost" size="lg" disabled={update.isPending} onClick={onDone}>
            Keep your own AI
          </Button>
        </div>
        <InlineError error={update.error} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3.5">
      <p className="text-[14px]">Tex is ready. The AI it uses comes out of your credits, along with running time and app actions.</p>
      <Button variant="primary" size="lg" onClick={onDone}>
        Continue with Textcrew AI
      </Button>
    </div>
  );
}

/** What Tex already runs on, so someone with an AI in place can simply carry on. */
function AlreadySet({ choices, ownKeys, onDone }: { choices: Record<AiChoice, AiChoiceState>; ownKeys: ByokProvider[]; onDone: () => void }) {
  const own = [
    ...(choices.claude_plan !== "not_set_up" ? ["your Claude plan"] : []),
    ...ownKeys.map((provider) => `your ${PROVIDER_LABEL[provider]} key`),
  ];
  const message =
    own.length > 0
      ? `Tex can already run on ${listNames(own, "and")}. Change it below, or carry on.`
      : choices.textcrew === "in_use"
        ? "Tex already works: it runs on Textcrew AI, paid in credits. Add your own AI below so the AI isn’t charged, or carry on."
        : null;
  if (!message) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-[13.5px] text-success">
      <CheckIcon size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <Button size="sm" onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}

/**
 * Step 3: the three ways Tex can get its AI. Nothing here is required to finish setup:
 * where Textcrew AI is on offer, Tex already works without a key.
 */
export function StepKey({ onDone }: { onDone: () => void }) {
  const settings = useAgentSettings();
  const [picked, setPicked] = useState<AiChoice>("own_key");

  if (settings.isPending) {
    return (
      <Card className="max-w-[620px]">
        <SkeletonRows rows={3} />
      </Card>
    );
  }
  if (settings.isError) {
    return (
      <div className="flex max-w-[620px] flex-col items-center gap-3">
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} className="py-6" />
        <Button variant="ghost" onClick={onDone}>
          Skip for now
        </Button>
      </div>
    );
  }

  const choices = describeAiChoices(settings.data);
  const noAi = settings.data.aiAccess === "none";

  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Choose how Tex gets its AI</h1>
        <p className="max-w-[540px] text-[15px] text-muted">
          There are three ways. With your own key or plan, the AI isn’t charged in credits. You can change this later under Agent &amp; AI.
        </p>
      </div>

      <AlreadySet choices={choices} ownKeys={settings.data.ownKeyProviders} onDone={onDone} />

      <div role="radiogroup" aria-label="How Tex gets its AI" className="flex flex-col gap-2.5">
        {CHOICES.map((choice) => (
          <ChoiceOption
            key={choice.id}
            title={choice.title}
            body={choice.body}
            tag={CHOICE_TAG[choice.id]}
            state={choices[choice.id]}
            checked={picked === choice.id}
            onPick={() => setPicked(choice.id)}
          />
        ))}
      </div>

      <Card className="p-5">
        {picked === "own_key" && <KeyForm onDone={onDone} />}
        {picked === "claude_plan" && <ClaudePanel connected={settings.data.claude.connected} onDone={onDone} />}
        {picked === "textcrew" && <TextcrewPanel settings={settings.data} onDone={onDone} />}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="flex min-w-[240px] flex-1 items-start gap-2.5 text-[13px] text-muted">
          <LockIcon size={16} className="mt-px shrink-0" />
          <span>
            {noAi
              ? "Tex can’t start a job until you add a key or connect a plan. You can also do it later under Agent & AI."
              : "Your key is encrypted, and a Claude plan is signed in on Anthropic’s own page: we never see those credentials."}
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {noAi ? "I’ll do this later" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
