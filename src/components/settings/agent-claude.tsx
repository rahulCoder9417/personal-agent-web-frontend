"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { Button, Card, InlineError, inputClass, Meta } from "@/components/ui";
import type { AgentSettings, ClaudeLoginStart } from "@/lib/api/client";
import { useCompleteClaudeLogin, useDisconnectClaude, useStartClaudeLogin } from "@/lib/api/hooks";
import { openInNewTab } from "@/lib/navigate";
import { cn, formatDate, formatTime } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { CHOICE_TAG, ChoiceHeading } from "./agent-choice";
import type { AiChoiceState } from "./agent-summary";

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

  const begin = () => {
    complete.reset();
    start.mutate(undefined, {
      onSuccess: (started) => {
        setLogin(started);
        setCode("");
        openInNewTab(started.authorizeUrl);
      } });
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
        } },
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
        <InlineError error={start.error} />
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
              onChange={(event) => setCode(event.target.value)}
              placeholder="Paste code"
              className={cn(inputClass, "min-w-40 flex-1 font-mono text-[12.5px]")}
            />
            <Button type="submit" variant="primary" className="h-[38px]" disabled={code.trim().length < 4} pending={complete.isPending}>
              Finish connecting
            </Button>
          </form>
        )}
        <InlineError error={complete.error} />
      </Step>
    </ol>
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
    <section className="flex flex-col gap-3">
      <ChoiceHeading title="Your Claude plan" tag={CHOICE_TAG.claude_plan} state={state}>
        Runs Claude Code in your private workspace, on the plan you already pay for. Your plan covers the AI, so the AI isn’t charged in credits.
      </ChoiceHeading>
      <Card className="flex flex-col gap-4 p-5">
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
              onConfirm={() => disconnect.mutate()}
            />
          )}
        </div>

        {connected ? (
          <>
            <p className="text-[13px] text-muted">
              {state === "in_use"
                ? "Disconnecting signs Claude Code out in your workspace, and Tex goes back to Hermes."
                : "Tex is running Hermes at the moment. Choose Claude Code under Agent to run on your plan."}
            </p>
            <InlineError error={disconnect.error} />
          </>
        ) : (
          <ClaudeConnectSteps />
        )}

        <p className="border-t border-line pt-4 text-[13px] text-muted">{CLAUDE_SIGN_IN_NOTE}</p>
      </Card>
    </section>
  );
}
