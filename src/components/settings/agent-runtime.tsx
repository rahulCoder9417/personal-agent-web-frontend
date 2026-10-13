"use client";

import { ChevronRightIcon } from "@/components/icons";
import { AgentFigure } from "@/components/tex";
import { toastError } from "@/components/toast";
import { Card, Pill, SectionLabel, Spinner } from "@/components/ui";
import type { AgentRuntime, AgentSettings } from "@/lib/api/client";
import { useUpdateAgentSettings } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import { chosenRuntime, describeAgentSettings, runtimePatch } from "./agent-summary";

function Fact({ label, children, className }: { label: string; children: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt>
        <SectionLabel as="span" className="text-muted">
          {label}
        </SectionLabel>
      </dt>
      <dd className="text-[13.5px] font-medium">{children}</dd>
    </div>
  );
}

/**
 * The summary at the top: what runs for this account and what pays for its AI, with how that is
 * decided folded away under it.
 */
export function RunningNowCard({ settings }: { settings: AgentSettings }) {
  const summary = describeAgentSettings(settings);
  return (
    <Card>
      <div className="flex items-center gap-4 px-5 pt-4 pb-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft">
          <AgentFigure who="tex" mood={summary.mood} glyph size={36} label="" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <SectionLabel as="span" className="text-muted">
            Running now
          </SectionLabel>
          <span className="text-[16px] font-semibold tracking-[-0.01em]">{summary.headline}</span>
          {summary.hint && <span className="text-[13px] text-muted">{summary.hint}</span>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line px-5 py-3.5 sm:grid-cols-3">
        <Fact label="Agent">{summary.agent}</Fact>
        <Fact label="AI paid by">{summary.paidBy}</Fact>
        <Fact label="Credits cover" className="max-sm:col-span-2">
          {summary.creditsCover}
        </Fact>
      </dl>
      <HowItsDecided settings={settings} />
    </Card>
  );
}

function RuntimeOption({
  title,
  description,
  note,
  checked,
  disabled,
  pending,
  onPick,
}: {
  title: string;
  description: string;
  note?: string;
  checked: boolean;
  disabled?: boolean;
  pending: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled || pending}
      onClick={() => {
        if (!checked) onPick();
      }}
      className={cn(
        "flex items-start gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-colors",
        checked ? "border-fg-2 bg-surface shadow-[0_0_0_1px_var(--fg-2)]" : "border-line bg-surface hover:border-fg/40",
        disabled && "bg-chrome hover:border-line",
      )}
    >
      <span aria-hidden className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]", checked ? "border-fg" : "border-line-strong")}>
        {pending ? <Spinner size={10} /> : <span className={cn("size-2 rounded-full", checked ? "bg-fg" : "bg-transparent")} />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold">
          {title}
          {note && <Pill>{note}</Pill>}
        </span>
        <span className="text-[12.5px] text-muted">{description}</span>
      </span>
    </button>
  );
}

/** Which agent runs: Hermes or Claude Code. Claude Code only becomes a choice once a Claude plan is connected. */
export function RuntimeChoice({ settings }: { settings: AgentSettings }) {
  const update = useUpdateAgentSettings();
  const chosen = chosenRuntime(settings);
  const pick = (runtime: AgentRuntime) =>
    update.mutate(runtimePatch(runtime), {
      onError: (error) => toastError(`Couldn’t switch to ${runtime === "hermes" ? "Hermes" : "Claude Code"}`, error),
    });
  const moving = (runtime: AgentRuntime) => update.isPending && update.variables?.runtime === runtime;

  return (
    <div role="radiogroup" aria-label="Agent" className="grid gap-2.5 sm:grid-cols-2">
      <RuntimeOption
        title="Hermes"
        description="Our agent. Runs on your own API key, or on Textcrew AI."
        checked={chosen === "hermes"}
        pending={moving("hermes")}
        onPick={() => pick("hermes")}
      />
      <RuntimeOption
        title="Claude Code"
        description="Runs Claude Code in your private workspace, on your Claude plan."
        note={settings.claude.connected ? "Beta" : "Needs a Claude plan"}
        checked={chosen === "claude_code"}
        disabled={!settings.claude.connected}
        pending={moving("claude_code")}
        onPick={() => pick("claude_code")}
      />
    </div>
  );
}

/** Only where Textcrew AI is on offer: choosing it comes before everything else. */
const CHOSEN_RULE = {
  when: "You chose Textcrew AI",
  then: "Hermes runs on Textcrew AI and the AI is paid in credits, even with a key saved or a plan connected. You can go back whenever you like.",
};

// In the order the backend applies them: the first that fits decides.
const RULES: { when: string; then: string }[] = [
  { when: "Claude plan connected", then: "Claude Code runs, when you choose it. Your plan covers the AI." },
  { when: "Your own API key", then: "Hermes runs. Your provider bills the AI, not your credits." },
  { when: "Neither", then: "Hermes runs on Textcrew AI, and the AI is paid in credits. Where Textcrew AI isn’t available, Tex can’t start a job until you add a key or connect a plan." },
];

/** The rules that pick the agent and what pays for its AI, folded away until asked for. */
export function HowItsDecided({ settings }: { settings: AgentSettings }) {
  const rules = settings.platformAvailable ? [CHOSEN_RULE, ...RULES] : RULES;
  return (
    <details className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-[13px] font-medium text-nav transition-colors select-none hover:text-fg [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon size={14} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
        How it’s decided
      </summary>
      <dl className="border-t border-line">
        {rules.map((rule) => (
          <div key={rule.when} className="flex gap-4 border-b border-line px-5 py-3 last:border-b-0 max-sm:flex-col max-sm:gap-1">
            <dt className="w-[160px] shrink-0 text-[13px] font-medium max-sm:w-full">{rule.when}</dt>
            <dd className="text-[13px] text-muted">{rule.then}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
