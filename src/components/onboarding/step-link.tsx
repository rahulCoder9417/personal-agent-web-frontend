"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, errorMessage, type ChannelType, type LinkCode } from "@/lib/api/client";
import { useChannels, useCreateLinkCode } from "@/lib/api/hooks";
import { BrandIcon } from "@/components/brand-icon";
import { CheckIcon, CopyIcon, ExternalIcon, LockIcon } from "@/components/icons";
import { AgentFigure } from "@/components/tex";
import { Button, Card, SectionLabel } from "@/components/ui";
import { openInNewTab } from "@/lib/navigate";
import { CHANNEL_LABEL, cn } from "@/lib/format";
import { ChatPreview } from "./chat-preview";

export type LinkableChannel = Exclude<ChannelType, "web">;
export const LINKABLE: readonly LinkableChannel[] = ["whatsapp", "telegram", "imessage"];

const POLL_MS = 3000;

function linkError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return "That’s a lot of codes. Wait a minute, then ask for a new one.";
  return errorMessage(error);
}

function subscribeToSeconds(onTick: () => void) {
  const timer = window.setInterval(onTick, 1000);
  return () => window.clearInterval(timer);
}

const neverTicks = () => () => {};
const currentSecond = () => Math.floor(Date.now() / 1000);

/** Seconds left until `iso`, re-read once a second (the clock only runs while there is a deadline). */
function useSecondsLeft(iso: string | undefined): number {
  const now = useSyncExternalStore(iso ? subscribeToSeconds : neverTicks, currentSecond, () => 0);
  return iso ? Math.max(0, Math.ceil(new Date(iso).getTime() / 1000) - now) : 0;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen to type by hand.
    }
  };

  return (
    <Button size="sm" onClick={copy} aria-live="polite">
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** Step 1: send a one-time code from WhatsApp, Telegram or iMessage, and that chat becomes your agent. */
export function StepLink({ initialChannel, onDone }: { initialChannel: LinkableChannel; onDone: () => void }) {
  const [channel, setChannel] = useState<LinkableChannel>(initialChannel);
  const [code, setCode] = useState<LinkCode | null>(null);
  // Links that existed before this code was made, so an old link doesn't count as "it worked".
  const [known, setKnown] = useState<string[]>([]);
  const create = useCreateLinkCode();
  const channels = useChannels();
  const secondsLeft = useSecondsLeft(code?.expiresAt);

  const name = CHANNEL_LABEL[channel];
  const live = code !== null && secondsLeft > 0;
  const expired = code !== null && secondsLeft === 0;
  const existing = channels.data?.find((link) => link.channel === channel);
  const fresh = code ? channels.data?.find((link) => link.channel === code.channel && !known.includes(link.id)) : undefined;
  const deepLink = code?.deepLink ?? null;

  // While a code is waiting, keep asking whether the chat has shown up.
  const refetch = channels.refetch;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void refetch(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, refetch]);

  // The code arrived: move on without being asked.
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(timer);
  }, [fresh, onDone]);

  const pick = (next: LinkableChannel) => {
    if (next === channel) return;
    setChannel(next);
    setCode(null);
    create.reset();
  };

  const getCode = () => {
    setKnown((channels.data ?? []).map((link) => link.id));
    create.mutate(channel, { onSuccess: setCode });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-8 min-[940px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Link the chat you already use</h1>
            <p className="max-w-[520px] text-[15px] text-muted">Send a one-time code from your chat app. From then on, that chat is your agent.</p>
          </div>

          <div role="group" aria-label="Chat app" className="flex flex-wrap gap-2">
            {LINKABLE.map((option) => {
              const on = option === channel;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(option)}
                  className={cn(
                    "flex h-11 items-center gap-2.5 rounded-full border bg-surface pr-4 pl-3 text-[14px] font-medium transition-colors",
                    on ? "border-fg-2 shadow-[0_0_0_1px_var(--fg-2)]" : "border-line hover:border-fg/40",
                  )}
                >
                  <BrandIcon name={option} size={18} />
                  {CHANNEL_LABEL[option]}
                </button>
              );
            })}
          </div>

          <Card className="flex flex-col gap-4 p-5">
            {fresh ? (
              <div role="status" className="flex items-center gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                  <CheckIcon size={20} />
                </span>
                <div className="flex flex-col">
                  <span className="text-[15px] font-semibold">{name} is linked</span>
                  <span className="text-[12px] text-muted">{fresh.displayId}</span>
                </div>
              </div>
            ) : code ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionLabel as="span">Your one-time code</SectionLabel>
                  <span className={cn("text-[12px]", expired ? "text-danger" : "text-muted")} aria-live="off">
                    {expired ? "expired" : `single use · expires in ${clock(secondsLeft)}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className={cn("font-mono text-[34px] leading-none font-semibold tracking-[0.02em] select-all", expired && "text-muted line-through")}>
                    {code.code}
                  </span>
                  {!expired && <CopyButton text={code.code} />}
                </div>
                {expired ? (
                  <p className="text-[13.5px] text-muted">Codes last 10 minutes. Get a new one and send that instead.</p>
                ) : (
                  <>
                    <p className="text-[14px]">{code.instructions}</p>
                    {deepLink && (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button variant="primary" size="lg" onClick={() => openInNewTab(deepLink)}>
                          Open {name}
                          <ExternalIcon size={14} />
                        </Button>
                        <span className="text-[13px] text-muted">Opens with the code already typed. Just press send.</span>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <SectionLabel as="span">Your one-time code</SectionLabel>
                {existing && (
                  <p className="text-[13.5px]">
                    {name} is already linked as <span className="text-[12.5px]">{existing.displayId}</span>. You can link another or carry on.
                  </p>
                )}
                <p className="text-[14px] text-muted">We’ll make a code that works once and lasts 10 minutes.</p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button variant="primary" size="lg" pending={create.isPending} onClick={getCode}>
                    Get my {name} code
                  </Button>
                  {existing && (
                    <Button size="lg" onClick={onDone}>
                      Continue
                    </Button>
                  )}
                </div>
              </>
            )}

            {create.isError && (
              <p role="alert" className="text-[12.5px] text-danger">
                {linkError(create.error)}
              </p>
            )}
          </Card>

          {code && !fresh && (
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft">
                <AgentFigure who="tex" mood={expired ? "paused" : "working"} glyph size={30} label="" />
              </span>
              <div role="status" className="flex min-w-[200px] flex-1 flex-col">
                <span className="font-semibold">{expired ? "That code ran out" : "Waiting for your message"}</span>
                <span className="text-[13px] text-muted">
                  {expired ? "Nothing was linked." : "This page moves on by itself once the code arrives."}
                </span>
              </div>
              <Button variant={expired ? "primary" : "secondary"} pending={create.isPending} onClick={getCode}>
                Get a new code
              </Button>
            </div>
          )}
        </div>

        <ChatPreview channel={channel} code={code && !expired ? code.code : null} linked={Boolean(fresh)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="flex items-start gap-2.5 text-[13px] text-muted">
          <LockIcon size={16} className="mt-px shrink-0" />
          <span>Unknown numbers only ever get a “link your account” reply. Nothing reaches an agent until a chat is linked.</span>
        </p>
        {!fresh && (
          <Button variant="ghost" size="sm" onClick={onDone}>
            I’ll do this later
          </Button>
        )}
      </div>
    </div>
  );
}
