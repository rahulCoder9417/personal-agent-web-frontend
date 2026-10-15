"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { AgentSettings, App, ChannelLink, ChannelType, Me } from "@/lib/api/client";
import { chatDraftHref } from "@/lib/chat-link";
import { CHANNEL_LABEL, cn } from "@/lib/format";
import { aiSource, appOffer, chatAppName, chatOffer, firstMessages, type StepId } from "@/lib/onboarding";
import { gmtOffset } from "@/components/settings/timezones";
import { CheckIcon, ChevronRightIcon } from "../icons";
import { AgentFigure } from "../tex";
import { Button, Card } from "../ui";

/** "Kolkata (GMT+5:30)" for "Asia/Kolkata"; "UTC" stays as it is. */
function zoneName(timeZone: string): string {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  const offset = gmtOffset(timeZone);
  return offset && offset !== city && timeZone !== "UTC" ? `${city} (${offset})` : city;
}

/** One line of the recap: what it is, where it stands, and a way to change it. */
function Row({ done, title, detail, action }: { done: boolean; title: string; detail: string; action: ReactNode }) {
  return (
    <li className="flex items-center gap-3.5 border-b border-line px-5 py-3.5 last:border-b-0">
      <span
        aria-hidden
        className={cn("grid size-[22px] shrink-0 place-items-center rounded-full", done ? "bg-success-soft text-success" : "border-[1.5px] border-line-strong")}
      >
        {done && <CheckIcon size={12} strokeWidth={2.5} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13.5px] font-semibold">{title}</span>
        <span className="text-[12.5px] text-muted">{detail}</span>
      </span>
      {action}
    </li>
  );
}

const linkClass = "shrink-0 text-[13px] font-medium text-accent hover:text-accent-dark";

/**
 * The last step: what is set up (from the API), the time zone Tex works in, and a first message to
 * open the chat with, typed in and not sent. Every way out of here finishes the welcome flow
 * (`onLeave`); the recap's links go back to a step instead.
 */
export function StepHi({
  me,
  settings,
  channels,
  apps,
  onStep,
  onLeave,
}: {
  me: Me | undefined;
  settings: AgentSettings | undefined;
  channels: { items: ChannelLink[]; available: ChannelType[] } | undefined;
  apps: App[] | undefined;
  onStep: (step: StepId) => void;
  onLeave: (path: string) => void;
}) {
  const ai = settings ? aiSource(settings) : undefined;
  const ready = ai !== null;
  const chat = channels ? chatOffer(channels) : null;
  const connected = apps ? appOffer(apps) : null;
  const [first, ...others] = firstMessages(apps ?? []);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex items-center gap-5 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <AgentFigure who="tex" mood={ready ? "done" : "paused"} size={120} label={ready ? "Tex, ready" : "Tex, waiting for an AI"} className="shrink-0 max-sm:size-[96px]" />
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">{ready ? "You’re set. Say hi to Tex" : "Almost there"}</h1>
          <p className="text-[15px] text-muted">
            {ready
              ? "Open the chat with a first message typed in. Change it if you like; nothing is sent until you press Send."
              : "Tex can’t answer until it has an AI to think with. It takes a minute: connect your Claude plan."}
          </p>
        </div>
      </div>

      {!ready && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-accent-soft px-4 py-3.5">
          <p className="min-w-[220px] flex-1 text-[13.5px] text-accent-dark">
            Without an AI, Tex answers every message with a note asking you to connect one.
          </p>
          <Button variant="primary" onClick={() => onStep("ai")}>
            Connect your AI
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <ul aria-label="What’s set up">
          <Row
            done={ready}
            title="Your AI"
            detail={ai === undefined ? "…" : ai === null ? "Not connected yet" : `Tex runs on ${ai}`}
            action={
              <button type="button" className={linkClass} onClick={() => onStep("ai")}>
                {ready ? "Change" : "Connect"}
              </button>
            }
          />
          {chat && (chat.linkable.length > 0 || chat.linked.length > 0) && (
            <Row
              done={chat.linked.length > 0}
              title={chat.linkable.length > 1 ? "Chat apps" : CHANNEL_LABEL[chat.linked[0]?.channel ?? chat.linkable[0]]}
              detail={chat.linked[0] ? `Linked as ${chat.linked[0].displayId}` : "Not linked. You can do it later in Settings."}
              action={
                chat.linked.length === 0 && (
                  <button type="button" className={linkClass} onClick={() => onStep("chat")}>
                    Link {chatAppName(chat.linkable)}
                  </button>
                )
              }
            />
          )}
          {connected && (connected.connected.length > 0 || connected.offered.length > 0) && (
            <Row
              done={connected.connected.length > 0}
              title="Apps"
              detail={connected.connected.length > 0 ? connected.connected.map((app) => app.name).join(", ") : "None yet. Add them any time from Apps."}
              action={
                <button type="button" className={linkClass} onClick={() => onStep("apps")}>
                  {connected.connected.length > 0 ? "Add more" : "Connect"}
                </button>
              }
            />
          )}
          {me && (
            <Row
              done={me.timezoneSet}
              title="Time zone"
              detail={`${zoneName(me.timezone)}. Reminders and automations run on this clock.`}
              action={
                <button type="button" className={linkClass} onClick={() => onLeave("/settings")}>
                  Change
                </button>
              }
            />
          )}
        </ul>
      </Card>

      <section aria-labelledby="first-message" className="flex flex-col gap-3">
        <h2 id="first-message" className="text-[13px] font-semibold">
          Your first message
        </h2>
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-3 pl-4 shadow-[0_0_0_1px_var(--line-strong),0_8px_24px_-14px_rgb(21_21_21/0.25)] sm:flex-row sm:items-center">
          <p className="flex-1 text-[15px]">{first}</p>
          <Button variant="primary" size="lg" className="max-sm:w-full" onClick={() => onLeave(chatDraftHref(first))}>
            Open chat with this
          </Button>
        </div>
        <p className="text-[12.5px] text-muted">Or start with one of these:</p>
        <ul className="flex flex-col gap-2">
          {others.map((ask) => (
            <li key={ask}>
              <Link
                href={chatDraftHref(ask)}
                onClick={(event) => {
                  event.preventDefault();
                  onLeave(chatDraftHref(ask));
                }}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] transition-colors hover:border-fg/40"
              >
                <span className="flex-1">“{ask}”</span>
                <ChevronRightIcon size={16} className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
