"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { Select } from "@/components/select";
import { toastError } from "@/components/toast";
import { Button, inputClass, Meta } from "@/components/ui";
import { refusedTypedValue } from "@/lib/action-errors";
import type { AgentSettings, ClaudeEffort, ClaudeLoginStart } from "@/lib/api/client";
import { useCompleteClaudeLogin, useDisconnectClaude, useStartClaudeLogin, useUpdateClaudeCode } from "@/lib/api/hooks";
import { choiceNotes, choiceValue, effortApplies, effortOptions, modelOptions, optionGroups, type SelectOption } from "@/lib/claude-code";
import type { ListItem, ListOption } from "@/lib/listbox";
import { openInNewTab } from "@/lib/navigate";
import { cn, formatDate, formatTime } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { CHOICE_TAG, ChoiceCard } from "./agent-choice";
import type { AiChoiceState } from "./agent-summary";
import { SettingRow } from "./settings-rows";

function Step({ n, state, title, children }: { n: number; state: "todo" | "now" | "done"; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
          state === "done" && "bg-success-soft text-success",
          state === "now" && "bg-fg text-white",
          state === "todo" && "bg-surface-2 text-muted",
        )}
      >
        {state === "done" ? <CheckIcon size={13} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span className={cn("text-[13.5px] font-medium", state === "todo" && "text-muted")}>{title}</span>
        {children}
      </div>
    </li>
  );
}

/**
 * Connecting a Claude plan is the unmodified Claude Code sign-in: open Anthropic's page, sign in
 * there, then paste the code it shows. Nothing but that code passes through this app.
 * Used in settings and in onboarding; the agent settings update themselves when it finishes.
 */
export function ClaudeConnectSteps() {
  const start = useStartClaudeLogin();
  const complete = useCompleteClaudeLogin();
  const [login, setLogin] = useState<ClaudeLoginStart | null>(null);
  const [code, setCode] = useState("");
  const codeId = useId();

  // The API's verdict on the pasted code is said under the field; any other failure is a toast.
  const codeError = refusedTypedValue(complete.error) ? complete.error.message : null;

  const begin = () => {
    complete.reset();
    start.mutate(undefined, {
      onSuccess: (started) => {
        setLogin(started);
        setCode("");
        openInNewTab(started.authorizeUrl);
      },
      onError: (error) => toastError("Couldn’t open Anthropic’s sign-in", error),
    });
  };

  const finish = (event: FormEvent) => {
    event.preventDefault();
    if (!login || code.trim().length < 4) return;
    complete.mutate(
      { loginId: login.loginId, code: code.trim() },
      {
        onSuccess: () => {
          setLogin(null);
          setCode("");
        },
        onError: (error) => {
          if (!refusedTypedValue(error)) toastError("Couldn’t connect your Claude plan", error);
        },
      },
    );
  };

  return (
    <ol className="flex flex-col gap-4">
      <Step n={1} state={login ? "done" : "now"} title="Sign in on Anthropic’s own page">
        {login ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Meta>opened in a new tab · code is good until {formatTime(login.expiresAt)}</Meta>
            <button
              type="button"
              onClick={() => openInNewTab(login.authorizeUrl)}
              className="text-[12.5px] font-medium text-accent hover:text-accent-dark"
            >
              Open it again
            </button>
            <button type="button" onClick={begin} disabled={start.isPending} className="text-[12.5px] text-muted hover:text-fg">
              Start over
            </button>
          </div>
        ) : (
          <Button variant="primary" pending={start.isPending} onClick={begin}>
            Open sign-in page
            <ExternalIcon size={13} />
          </Button>
        )}
      </Step>

      <Step n={2} state={login ? "now" : "todo"} title={<label htmlFor={codeId}>Paste the code Anthropic shows you</label>}>
        {login && (
          <form onSubmit={finish} className="flex w-full flex-wrap gap-2">
            <input
              id={codeId}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (complete.isError) complete.reset();
              }}
              placeholder="Paste code"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? `${codeId}-error` : undefined}
              className={cn(inputClass, "min-w-40 flex-1 font-mono text-[12.5px]", codeError && "border-danger")}
            />
            <Button type="submit" variant="primary" className="h-[38px]" disabled={code.trim().length < 4} pending={complete.isPending}>
              Finish connecting
            </Button>
          </form>
        )}
        {login && codeError && (
          <p id={`${codeId}-error`} role="alert" className="text-[12.5px] text-danger">
            {codeError}
          </p>
        )}
      </Step>
    </ol>
  );
}

/** The options as the dropdown takes them: under their headings, with a model's note as its second line. */
function listItems(options: SelectOption[]): ListItem[] {
  return optionGroups(options).flatMap((group): ListItem[] => {
    const items: ListOption[] = group.options.map(({ value, label, note }) => (note ? { value, label, description: note } : { value, label }));
    return group.label ? [{ label: group.label, options: items }] : items;
  });
}

function ChoiceSelect({
  id,
  label,
  help,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  help: ReactNode;
  value: string | null;
  options: SelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow label={label} htmlFor={id} help={help}>
      <Select id={id} label={label} value={value ?? ""} options={listItems(options)} disabled={disabled} onChange={onChange} minListWidth={300} />
    </SettingRow>
  );
}

/** "Saved", after the help of the choice that was just saved. */
function SavedNote() {
  return (
    <span role="status" className="text-success">
      {" "}
      · Saved
    </span>
  );
}

/**
 * Which Claude model Claude Code uses and how hard it thinks, as two rows of the Engine group.
 * "Default" is Sonnet 5.5 at low effort, for quick answers (Byte and Patch keep Opus 5.5). Each change is saved as it is made; it applies to turns that
 * run on Claude Code. Only offered once a Claude plan is connected.
 */
export function ClaudeCodeChoices({ settings }: { settings: AgentSettings }) {
  const update = useUpdateClaudeCode();
  const id = useId();
  // The select goes back to what is saved when a change is refused; the toast says why.
  const refused = { onError: (error: unknown) => toastError("Couldn’t save that choice", error) };
  const saved = update.isSuccess ? (update.variables && "claudeModel" in update.variables ? "model" : "effort") : null;
  const notes = choiceNotes(settings);

  return (
    <>
      <ChoiceSelect
        id={`${id}-model`}
        label="Model"
        help={
          <>
            The Claude model Claude Code runs. Default is Sonnet 5.5 at low effort, for quick answers; Byte and Patch then work on Opus 5.5.
            {saved === "model" && <SavedNote />}
          </>
        }
        value={settings.claudeModel}
        options={modelOptions(settings)}
        onChange={(value) => update.mutate({ claudeModel: choiceValue(value) }, refused)}
      />
      <ChoiceSelect
        id={`${id}-effort`}
        label="Thinking effort"
        help={
          <>
            How hard Claude Code thinks before it answers. Default is low on the default model, and Claude Code’s own for a model you pick.
            {saved === "effort" && <SavedNote />}
          </>
        }
        value={settings.claudeEffort}
        options={effortOptions(settings)}
        disabled={!effortApplies(settings)}
        onChange={(value) => update.mutate({ claudeEffort: choiceValue<ClaudeEffort>(value) }, refused)}
      />
      {notes.length > 0 && (
        // What the chosen model and effort come to, under the two rows, at the foot of the card.
        <div className="flex flex-col gap-1 rounded-b-[11px] bg-surface-2/60 px-5 py-3 text-[12.5px] text-muted">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
    </>
  );
}

/** What we never do with a Claude plan, said the same way wherever it can be connected. */
export const CLAUDE_SIGN_IN_NOTE =
  "This is the unmodified Claude Code sign-in, started inside your private workspace. We never see or store your Claude credentials.";

/** The second way to get AI: the Claude plan you already pay for, running Claude Code. Plain text only, no logos. */
export function ClaudePlanSection({ settings, state }: { settings: AgentSettings; state: AiChoiceState }) {
  const disconnect = useDisconnectClaude();
  const connected = settings.claude.connected;

  return (
    <ChoiceCard
      id={CLAUDE_PLAN_ANCHOR}
      title="Your Claude plan"
      tag={CHOICE_TAG.claude_plan}
      state={state}
      description="Runs Claude Code in your private workspace, on the plan you already pay for. Your plan covers the AI, so the AI isn’t charged in credits."
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14.5px] font-semibold">{connected ? "Claude plan connected" : "Connect your Claude plan"}</span>
            <Meta>
              {connected
                ? settings.claude.connectedAt
                  ? `connected ${formatDate(settings.claude.connectedAt)}`
                  : "connected"
                : "optional · two steps"}
            </Meta>
          </div>
          {connected && (
            <ConfirmButton
              label="Disconnect"
              confirmLabel="Disconnect plan"
              ariaLabel="Disconnect your Claude plan"
              pending={disconnect.isPending}
              onConfirm={() => disconnect.mutate(undefined, { onError: (error) => toastError("Couldn’t disconnect your Claude plan", error) })}
            />
          )}
        </div>

        {connected ? (
          <p className="text-[13px] text-muted">
            {state === "in_use"
              ? "Disconnecting signs Claude Code out in your workspace, and Tex goes back to Hermes."
              : "Tex is running Hermes at the moment. Choose Claude Code under Engine to run on your plan."}
          </p>
        ) : (
          <ClaudeConnectSteps />
        )}

        <p className="border-t border-line pt-4 text-[13px] text-muted">{CLAUDE_SIGN_IN_NOTE}</p>
      </div>
    </ChoiceCard>
  );
}

/** Where the Claude plan's card is on the page, for the link that leads to it. */
export const CLAUDE_PLAN_ANCHOR = "claude-plan";
