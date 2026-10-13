"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  useActivity,
  useAgentSettings,
  useAgentStatus,
  useApprovals,
  useAutomations,
  useAvailableChannels,
  useChannels,
} from "@/lib/api/hooks";
import { describeAgent } from "@/lib/agent-state";
import { approvalReason } from "@/lib/approvals";
import { linkableChannels } from "@/lib/channels";
import { CHANNEL_LABEL, cn, describeAutomationNext, describeAutomationSchedule, formatCredits, formatTime, listNames } from "@/lib/format";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { PANEL_MOTION, useStaysDrawn } from "@/lib/motion";
import { focusAfterToggle } from "@/lib/panels";
import { AppIcon } from "../brand-icon";
import { CheckIcon, ChevronRightIcon, ClockIcon, PanelRightIcon } from "../icons";
import { AgentFigure } from "../tex";
import { ButtonLink, IconButton } from "../ui";
import { FoldingPane } from "./folding-pane";

function Section({ title, count, href, children }: { title: string; count?: number; href: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Link href={href} className="group flex items-center gap-1.5 text-[13px] font-semibold">
        {title}
        {!!count && <span className="text-muted tabular-nums">{count}</span>}
        <ChevronRightIcon size={13} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </Link>
      {children}
    </section>
  );
}

function Row({ icon, title, meta, metaClass, href }: { icon: ReactNode; title: string; meta: string; metaClass?: string; href?: string }) {
  const body = (
    <>
      {icon}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[13.5px] font-medium">{title}</span>
        <span className={cn("truncate text-[12px] text-muted tabular-nums", metaClass)}>{meta}</span>
      </div>
    </>
  );
  const className = "-mx-2 flex items-center gap-3 rounded-[10px] px-2 py-1.5";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted">{children}</p>;
}

function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-nav", className)}>{children}</span>;
}

// Activity entries that record Tex talking, asking or reporting, rather than something it got done.
const CHATTER = new Set([
  "send_message",
  "request_approval",
  "approval_requested",
  "get_profile",
  "list_app_actions",
  "list_automations",
  // A specialist's progress line, a review being asked for, and a page that was refused are not things done.
  "crew_progress",
  "pr_review_requested",
  "pr_review_skipped",
  "read_page_refused",
  // Looking in its memory, or being refused a save, is not something done either.
  "recall",
  "memory_refused",
]);

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

const MOOD_LINE: Record<string, string> = {
  asking: "It has stopped until you answer.",
  working: "It will message you when it’s done.",
  ready: "Hand it something. It works in the background.",
  asleep: "It wakes up as soon as you message it.",
  paused: "Something needs fixing before it can work.",
};

/**
 * Where there is no room for the panel, and so none for the header's button that brings it back:
 * below 1100px, or 1340px with the list of conversations open beside the thread. The panel folds
 * there as it does when it is closed, so opening the list beside it moves the two together rather
 * than making the panel jump. Whole class names, so Tailwind finds them.
 */
const ROOM = {
  alone: {
    panel: "max-[1100px]:invisible max-[1100px]:w-0",
    inside: "max-[1100px]:opacity-0",
    reopen: "min-[1100px]:visible min-[1100px]:max-w-9 min-[1100px]:opacity-100",
  },
  besideChats: {
    panel: "max-[1340px]:invisible max-[1340px]:w-0",
    inside: "max-[1340px]:opacity-0",
    reopen: "min-[1340px]:visible min-[1340px]:max-w-9 min-[1340px]:opacity-100",
  },
} as const;

const PANEL_ID = "side-panel";
const HIDE_ID = "side-panel-hide";
const SHOW_ID = "side-panel-show";

/**
 * The right-hand panel of the chat: Tex itself, what's waiting on you, what's done and what's next.
 * Below 1100px it is folded away, and then its contents aren't drawn at all, so a phone or a narrow
 * window never asks for what it shows. With the list of conversations open beside the thread
 * (`besideChats`) it needs 1340px, so three columns never squeeze the thread. The empty panel
 * keeps its place on a wide screen until the browser has said how wide it is.
 *
 * Its own button folds it away (`hidden`, which this browser remembers) and `SidePanelReopen`, in
 * the chat's header, brings it back.
 */
export function SidePanel({
  besideChats = false,
  hidden = false,
  motion = false,
  onHide,
}: {
  besideChats?: boolean;
  /** The person folded it away. */
  hidden?: boolean;
  /** Whether it may move yet (`useMotionReady`). */
  motion?: boolean;
  onHide?: () => void;
}) {
  const shown = useMediaQuery(besideChats ? SHOWN_AT.sidePanelBesideChats : SHOWN_AT.sidePanel);
  const room = besideChats ? ROOM.besideChats : ROOM.alone;
  // Drawn while it is on screen, and while it folds away.
  const drawn = useStaysDrawn(shown && !hidden);
  return (
    <FoldingPane
      id={PANEL_ID}
      label="Right now"
      side="right"
      width="w-[320px]"
      open={!hidden}
      motion={motion}
      className={room.panel}
      innerClassName={cn("flex flex-col border-l border-line", room.inside)}
    >
      <div className="flex shrink-0 items-center gap-1 pt-3.5 pr-2 pb-2 pl-5">
        <h2 className="flex-1 text-[13px] font-semibold">Right now</h2>
        <IconButton
          id={HIDE_ID}
          label="Hide side panel"
          aria-controls={PANEL_ID}
          aria-expanded
          onClick={(event) => {
            onHide?.();
            focusAfterToggle(event.currentTarget, SHOW_ID);
          }}
        >
          <PanelRightIcon size={17} />
        </IconButton>
      </div>
      <div className="scroll-pane flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pt-1 pb-5">{drawn && <SidePanelContents />}</div>
    </FoldingPane>
  );
}

/**
 * The header's button that brings the side panel back after it was folded away. It is there only
 * while the panel is folded and there is room for it, and fades in and out as the panel goes and
 * comes.
 */
export function SidePanelReopen({
  besideChats = false,
  hidden,
  motion,
  onShow,
}: {
  besideChats?: boolean;
  hidden: boolean;
  motion: boolean;
  onShow: () => void;
}) {
  const room = besideChats ? ROOM.besideChats : ROOM.alone;
  return (
    // The wrapper fades and folds, so the button keeps its own hover transition and its focus ring.
    <span className={cn("invisible flex max-w-0 shrink-0 opacity-0", motion && cn("transition-[max-width,opacity,visibility]", PANEL_MOTION), hidden && room.reopen)}>
      <IconButton
        id={SHOW_ID}
        label="Show side panel"
        aria-controls={PANEL_ID}
        aria-expanded={false}
        onClick={(event) => {
          onShow();
          focusAfterToggle(event.currentTarget, HIDE_ID);
        }}
        className="size-9"
      >
        <PanelRightIcon size={18} />
      </IconButton>
    </span>
  );
}

function SidePanelContents() {
  const status = useAgentStatus();
  const approvals = useApprovals("pending");
  const activity = useActivity();
  const automations = useAutomations();
  const channels = useChannels();
  const available = useAvailableChannels();
  const settings = useAgentSettings();

  const pending = approvals.data ?? [];
  const agent = describeAgent(status.data?.state, pending.length);

  const doneToday = (activity.data?.pages[0]?.items ?? [])
    .filter((entry) => isToday(entry.createdAt) && (entry.actor === "agent" || entry.actor === "system") && !CHATTER.has(entry.action))
    .slice(0, 4);

  const upNext = (automations.data ?? [])
    .filter((a) => a.enabled)
    .sort((a, b) => (a.nextRunAt ?? "9999").localeCompare(b.nextRunAt ?? "9999"))
    .slice(0, 3);

  // Only nag about linking a chat when there is a chat app that can be linked.
  const linkable = linkableChannels(available.data ?? []);
  const needsChat = channels.data !== undefined && linkable.length > 0 && !channels.data.some((c) => c.channel !== "web");
  const needsAi = settings.data?.aiAccess === "none";

  return (
    <>
      {/* Tex in person: the one place the mascot gets room. Its face follows the agent's real state. */}
      <div className="flex flex-col items-center rounded-2xl bg-accent-soft px-4 pt-3 pb-4 text-center">
        <AgentFigure who="tex" mood={agent.mood} size={124} label={agent.title} />
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{agent.title}</p>
        <p className="text-[12.5px] text-nav">{MOOD_LINE[agent.mood] ?? MOOD_LINE.ready}</p>
      </div>

      {(needsChat || needsAi) && (
        <div className="flex flex-col gap-2 rounded-xl px-3.5 py-3 shadow-[0_0_0_1px_var(--line-strong)]">
          <p className="text-[13.5px] font-semibold">Finish setting up</p>
          <p className="text-[13px] text-muted">
            {needsAi
              ? "Textcrew AI isn’t available on this account, so Tex needs your own API key or your Claude plan before it can start a job."
              : `Link ${listNames(linkable.map((channel) => CHANNEL_LABEL[channel]))} to text Tex from your phone.`}
          </p>
          <ButtonLink href={needsAi ? "/settings/agent" : "/onboarding"} variant="primary" size="sm" className="self-start">
            {needsAi ? "Add your AI" : "Link a chat app"}
          </ButtonLink>
        </div>
      )}

      <Section title="Needs your OK" count={pending.length} href="/approvals">
        {pending.length === 0 ? (
          <Quiet>Nothing is waiting on you.</Quiet>
        ) : (
          pending.slice(0, 3).map((approval) => {
            const reason = approvalReason(approval.action);
            return (
              <Row
                key={approval.id}
                href="/approvals"
                icon={<AppIcon name={approval.app ?? "web"} size={32} />}
                title={approval.summary}
                meta={reason.label}
                metaClass={reason.tone === "danger" ? "text-danger" : "text-accent-dark"}
              />
            );
          })
        )}
      </Section>

      <Section title="Done today" href="/activity">
        {doneToday.length === 0 ? (
          <Quiet>Nothing yet today.</Quiet>
        ) : (
          doneToday.map((entry) => (
            <Row
              key={entry.id}
              icon={
                <Tile className="bg-success-soft text-success">
                  <CheckIcon size={15} />
                </Tile>
              }
              title={entry.summary}
              meta={`${formatTime(entry.createdAt)}${entry.creditsCharged ? ` · ${formatCredits(entry.creditsCharged)}` : ""}`}
            />
          ))
        )}
      </Section>

      <Section title="Up next" href="/automations">
        {upNext.length === 0 ? (
          <Quiet>No automations yet. Ask Tex for one, like “every Monday at 9am, send me my week”.</Quiet>
        ) : (
          upNext.map((automation) => (
            <Row
              key={automation.id}
              icon={
                automation.kind === "event" && automation.trigger?.app ? (
                  <AppIcon name={automation.trigger.app} size={32} />
                ) : (
                  <Tile>
                    <ClockIcon size={16} />
                  </Tile>
                )
              }
              title={automation.title}
              meta={automation.kind === "event" ? describeAutomationSchedule(automation) : describeAutomationNext(automation)}
            />
          ))
        )}
      </Section>
    </>
  );
}
