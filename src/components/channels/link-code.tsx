"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ApiError, errorMessage, type ChannelLink, type LinkCode } from "@/lib/api/client";
import { useChannels, useCreateLinkCode } from "@/lib/api/hooks";
import { BrandIcon } from "@/components/brand-icon";
import { CheckIcon, CopyIcon, ExternalIcon } from "@/components/icons";
import { AgentFigure } from "@/components/tex";
import { toastError } from "@/components/toast";
import { Button, SectionLabel } from "@/components/ui";
import type { LinkableChannel } from "@/lib/channels";
import { openInNewTab } from "@/lib/navigate";
import { CHANNEL_LABEL, cn } from "@/lib/format";

// Linking a chat app with a one-time code: ask for a code, show it with the way to send it, wait
// for the chat to show up, and say so. The welcome flow's chat app step and the chat apps tab of
// Integrations both draw it from here, each around it in its own layout.

const POLL_MS = 3000;

export function linkError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return "That’s a lot of codes. Wait a minute, then ask for a new one.";
  if (error instanceof ApiError && error.code === "channel_disabled") return "That chat app is switched off right now.";
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

export type ChatLink = {
  channel: LinkableChannel;
  /** "Telegram". */
  name: string;
  /** The code asked for for this chat app, or null before one is asked for. */
  code: LinkCode | null;
  secondsLeft: number;
  /** A code is out and still good: the linked chats are asked for every few seconds. */
  live: boolean;
  expired: boolean;
  /** A chat of this app that was linked before. */
  existing: ChannelLink | undefined;
  /** The chat the code linked, once it has shown up. */
  fresh: ChannelLink | undefined;
  /** A code is being asked for. */
  pending: boolean;
  getCode: () => void;
  /** Forgets the code (another chat app was picked, or the panel was closed). */
  reset: () => void;
};

/**
 * Linking `channel` with a one-time code. Only a chat that wasn't linked when the code was made
 * counts as the code having worked, so an old link never reads as "it worked". A code made for
 * another chat app doesn't show for this one. A refusal is a toast.
 */
export function useChatLink(channel: LinkableChannel): ChatLink {
  // The code, and the links that existed before it was made.
  const [made, setMade] = useState<{ code: LinkCode; known: readonly string[] } | null>(null);
  const create = useCreateLinkCode();
  const channels = useChannels();

  const code = made && made.code.channel === channel ? made.code : null;
  const secondsLeft = useSecondsLeft(code?.expiresAt);
  const name = CHANNEL_LABEL[channel];
  const live = code !== null && secondsLeft > 0;
  const fresh = code && made ? channels.data?.find((link) => link.channel === code.channel && !made.known.includes(link.id)) : undefined;

  // Kept the same from one render to the next, so it can be waited on in an effect.
  const forget = create.reset;
  const reset = useCallback(() => {
    setMade(null);
    forget();
  }, [forget]);

  // While a code is waiting, keep asking whether the chat has shown up.
  const refetch = channels.refetch;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void refetch(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, refetch]);

  return {
    channel,
    name,
    code,
    secondsLeft,
    live,
    expired: code !== null && secondsLeft === 0,
    existing: channels.data?.find((link) => link.channel === channel),
    fresh,
    pending: create.isPending,
    getCode: () => {
      const known = (channels.data ?? []).map((link) => link.id);
      create.mutate(channel, {
        onSuccess: (next) => setMade({ code: next, known }),
        // Refused because the channel was just switched off: fetch the list again so it stops being offered.
        onError: (error) => {
          if (error instanceof ApiError && error.code === "channel_disabled") void refetch();
          toastError(`Couldn’t make a ${name} code`, linkError(error));
        },
      });
    },
    reset,
  };
}

/**
 * The inside of the linking card: the chat that was just linked, the code with the way to send it
 * (or that it ran out), or before any code, `idle`, which each place words in its own way.
 */
export function LinkCodeBody({ link, idle }: { link: ChatLink; idle: ReactNode }) {
  const { code, expired, fresh, name } = link;
  if (fresh) {
    return (
      <div role="status" className="flex items-center gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-soft text-success">
          <CheckIcon size={20} />
        </span>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold">{name} is linked</span>
          <span className="text-[12px] text-muted">{fresh.displayId}</span>
        </div>
      </div>
    );
  }
  if (!code) return idle;
  const deepLink = code.deepLink ?? null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel as="span">Your one-time code</SectionLabel>
        <span className={cn("text-[12px]", expired ? "text-danger" : "text-muted")} aria-live="off">
          {expired ? "expired" : `single use · expires in ${clock(link.secondsLeft)}`}
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
  );
}

/**
 * Under the card while a code is out: Tex waiting for it (or that it ran out) and a new code.
 * `arrives` says what happens once the code arrives.
 */
export function LinkWaiting({ link, arrives }: { link: ChatLink; arrives: string }) {
  if (!link.code || link.fresh) return null;
  const { expired } = link;
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft">
        <AgentFigure who="tex" mood={expired ? "paused" : "working"} glyph size={30} label="" />
      </span>
      <div role="status" className="flex min-w-[200px] flex-1 flex-col">
        <span className="font-semibold">{expired ? "That code ran out" : "Waiting for your message"}</span>
        <span className="text-[13px] text-muted">{expired ? "Nothing was linked." : arrives}</span>
      </div>
      <Button variant={expired ? "primary" : "secondary"} pending={link.pending} onClick={link.getCode}>
        Get a new code
      </Button>
    </div>
  );
}

/** With several chat apps on offer: which one to link, as a row of pills. */
export function ChannelPicker({
  options,
  value,
  onPick,
}: {
  options: readonly LinkableChannel[];
  value: LinkableChannel;
  onPick: (channel: LinkableChannel) => void;
}) {
  return (
    <div role="group" aria-label="Chat app" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(option)}
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
  );
}
