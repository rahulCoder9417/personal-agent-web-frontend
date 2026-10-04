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
import { AppIcon } from "../brand-icon";
import { CheckIcon, ChevronRightIcon, ClockIcon } from "../icons";
import { AgentFigure } from "../tex";
import { ButtonLink } from "../ui";

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

/** The right-hand panel of the chat: Tex itself, what's waiting on you, what's done and what's next. */
export function SidePanel() {
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
    <aside aria-label="Right now" className="scroll-pane flex w-[320px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-line px-5 pt-5 pb-5 max-[1100px]:hidden">
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
    </aside>
  );
}
