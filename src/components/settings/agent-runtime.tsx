"use client";

import { AgentFigure } from "@/components/tex";
import { Card, InlineError, Pill, SectionLabel, Spinner } from "@/components/ui";
import type { AgentRuntime, AgentSettings } from "@/lib/api/client";
import { useUpdateAgentSettings } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import { chosenRuntime, describeAgentSettings, runtimePatch } from "./agent-summary";

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel as="span">{label}</SectionLabel>
      <span className="text-[13.5px] font-medium">{children}</span>
    </div>
  );
}

/** The summary at the top: what runs for this account and what pays for its AI. */
export function RunningNowCard({ settings }: { settings: AgentSettings }) {
  const summary = describeAgentSettings(settings);
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4">
      <div className="flex min-w-[260px] flex-1 items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent-soft">
          <AgentFigure who="tex" mood={summary.mood} glyph size={42} label="" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <SectionLabel as="span">Running now</SectionLabel>
          <span className="text-[16px] font-semibold tracking-[-0.01em]">{summary.headline}</span>
          {summary.hint && <span className="text-[13px] text-muted">{summary.hint}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-7 gap-y-3">
        <Fact label="Agent">{summary.agent}</Fact>
        <Fact label="AI paid by">{summary.paidBy}</Fact>
        <Fact label="Credits cover">{summary.creditsCover}</Fact>
      </div>
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
        checked ? "border-fg-2 bg-surface" : "border-line bg-surface hover:border-fg/40",
        disabled && "bg-chrome hover:border-line",
      )}
    >
      <span aria-hidden className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]", checked ? "border-fg" : "border-line-strong")}>
        {pending ? <Spinner size={10} /> : <span className={cn("size-2 rounded-full", checked ? "bg-fg" : "bg-transparent")} />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[14.5px] font-semibold">
          {title}
          {note && <Pill>{note}</Pill>}
        </span>
        <span className="text-[13px] text-muted">{description}</span>
      </span>
    </button>
  );
}

/** Which agent runs. Claude Code only becomes a choice once a Claude plan is connected. */
export function RuntimeSection({ settings }: { settings: AgentSettings }) {
  const update = useUpdateAgentSettings();
  const chosen = chosenRuntime(settings);
  const pick = (runtime: AgentRuntime) => update.mutate(runtimePatch(runtime));
  const moving = (runtime: AgentRuntime) => update.isPending && update.variables?.runtime === runtime;

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Agent</SectionLabel>
      <div role="radiogroup" aria-label="Agent" className="flex flex-col gap-2.5">
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
      <InlineError error={update.error} />
    </section>
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

export function HowItsDecided({ settings }: { settings: AgentSettings }) {
  const rules = settings.platformAvailable ? [CHOSEN_RULE, ...RULES] : RULES;
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>How it’s decided</SectionLabel>
      <Card>
        <dl>
          {rules.map((rule) => (
            <div key={rule.when} className="flex gap-4 border-b border-line px-5 py-3.5 last:border-b-0 max-sm:flex-col max-sm:gap-1">
              <dt className="w-[150px] shrink-0 text-[13.5px] font-medium max-sm:w-full">{rule.when}</dt>
              <dd className="text-[13px] text-muted">{rule.then}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}
