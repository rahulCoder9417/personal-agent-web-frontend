"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { AppIcon } from "@/components/brand-icon";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { Button, Card, InlineError, inputClass, Meta, SectionLabel } from "@/components/ui";
import type { AgentSettings, ClaudeLoginStart } from "@/lib/api/client";
import { useCompleteClaudeLogin, useDisconnectClaude, useStartClaudeLogin } from "@/lib/api/hooks";
import { openInNewTab } from "@/lib/navigate";
import { cn, formatDate, formatTime } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";

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
 * Connecting a Claude plan is the official Claude Code sign-in: open Anthropic's page,
 * sign in there, then paste the code it shows. Nothing but that code passes through this app.
 */
export function ClaudePlanSection({ settings }: { settings: AgentSettings }) {
  const start = useStartClaudeLogin();
  const complete = useCompleteClaudeLogin();
  const disconnect = useDisconnectClaude();
  const [login, setLogin] = useState<ClaudeLoginStart | null>(null);
  const [code, setCode] = useState("");
  const codeId = useId();
  const connected = settings.claude.connected;

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
    <section className="flex flex-col gap-3">
      <SectionLabel>Claude plan</SectionLabel>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <AppIcon name="claude" size={40} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14.5px] font-semibold">{connected ? "Claude plan connected" : "Connect your Claude plan"}</span>
            <Meta>
              {connected
                ? settings.claude.connectedAt
                  ? `connected ${formatDate(settings.claude.connectedAt)}`
                  : "connected"
                : "optional · lets Tex run on Claude Code"}
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
              Disconnecting signs Claude Code out in your workspace, and Tex goes back to Hermes.
            </p>
            <InlineError error={disconnect.error} />
          </>
        ) : (
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
        )}

        <p className="border-t border-line pt-4 text-[13px] text-muted">
          This is the unmodified Claude Code sign-in, started inside your private workspace. We never see or store your Claude credentials.
        </p>
      </Card>
    </section>
  );
}
