"use client";

// The Automations screen: the title with one line of how they stand (and the plan's room) and the
// two ways to make one; what needs the person (an app to connect, a pause the system made), in
// amber; the drafts waiting to be saved; then every automation as a row of a list (pull-request
// review included, its repo as a chip), with filters and a search; and templates to start from.

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { Automation, AutomationRun } from "@/lib/api/client";
import { useApps, useAutomations, useAutomationsChat, useDeleteAutomation, useDisablePrReview, useLatestRuns, useMe, useUpdateAutomation } from "@/lib/api/hooks";
import { automationApps, brokenApps, type AppLink } from "@/lib/automation-apps";
import { automationHref, hasSteps, reviewedRepo } from "@/lib/automation-flow";
import {
  inFilter,
  lastRunStatus,
  listHeadline,
  matchesSearch,
  needsYou,
  nextRunText,
  rowApps,
  rowLine,
  rowRepo,
  rowTitle,
  type ListFilter,
  type NeedsYou,
} from "@/lib/automation-list";
import { AUTOMATION_CREDITS } from "@/lib/automations";
import { useAutomationsUnread } from "@/lib/automations-seen";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { cn, titleCase } from "@/lib/format";
import { connectedReturnPath, INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { PRICING_PATH } from "@/lib/pricing";
import { isConnectable } from "../apps/apps-logic";
import { useConnectDialog } from "../apps/connect-dialog";
import { ChatIcon, PencilIcon, PlayIcon, PlusIcon, SearchIcon, TrashIcon } from "../icons";
import { AgentFigure } from "../tex";
import { toastError } from "../toast";
import { ErrorState, Switch } from "../ui";
import { isFinished } from "./automation-status";
import { DraftsWaiting } from "./drafts-waiting";
import { AppLogo, Btn, BtnLink, Chip, Dot, LogoStack, MoreMenu, Notice, T1, T2, T3, usePlanAutomations } from "./parts";
import { useRunOnce } from "./run-once";
import { LIST_TEMPLATES, PlanFullNote, TemplateCards } from "./templates";

type Row = {
  automation: Automation;
  links: AppLink[];
  broken: AppLink[];
  run: AutomationRun | null | undefined;
  needs: NeedsYou | null;
};

const GRID = "@min-[880px]:grid-cols-[168px_minmax(0,1fr)_184px_168px_88px]";

// ---------------------------------------------------------------- what needs the person

function ConnectButton({ link, onOpen }: { link: AppLink; onOpen: (link: AppLink) => void }) {
  if (link.health === "plan")
    return (
      <BtnLink href={PRICING_PATH} size="sm" variant="primary">
        See plans
      </BtnLink>
    );
  if (!link.app || !isConnectable(link.app))
    return (
      <BtnLink href={INTEGRATIONS_APPS_PATH} size="sm" variant="primary">
        Open Integrations
      </BtnLink>
    );
  return (
    <Btn size="sm" variant="primary" onClick={() => onOpen(link)}>
      {link.health === "reconnect" ? `Reconnect ${link.name}` : `Connect ${link.name}`}
    </Btn>
  );
}

const quoted = (list: readonly Automation[]) => (list.length === 1 ? `“${list[0].title}”` : `${list.length} automations`);

/** One notice per app that stopped working, then the pauses the system made: amber, each with its way out. */
function Notices({ rows }: { rows: readonly Row[] }) {
  const flow = useConnectDialog({ returnPath: (app) => connectedReturnPath(app.slug) });
  const byApp = new Map<string, { link: AppLink; uses: Automation[] }>();
  for (const row of rows) for (const link of row.broken) byApp.set(link.slug, { link, uses: [...(byApp.get(link.slug)?.uses ?? []), row.automation] });
  const credits = rows.filter((row) => !row.automation.enabled && row.automation.pausedReason === "out_of_credits").map((row) => row.automation);
  const failed = rows.filter((row) => !row.automation.enabled && row.automation.pausedReason === "failures").map((row) => row.automation);
  if (byApp.size === 0 && credits.length === 0 && failed.length === 0) return null;
  const open = (link: AppLink) => link.app && flow.open(link.app, link.health === "reconnect" ? "reconnect" : "connect");

  return (
    <div className="flex flex-col gap-3">
      {[...byApp.values()].map(({ link, uses }) => (
        <Notice key={link.slug} logo={<AppLogo slug={link.slug} size={32} iconUrl={link.app?.iconUrl} />} action={<ConnectButton link={link} onOpen={open} />}>
          {link.health === "reconnect" ? (
            <>
              <span className="font-semibold">{link.name} needs reconnecting.</span>{" "}
              <span className="text-fg-2">Its sign-in stopped working, so {quoted(uses)} can’t use it until you reconnect it.</span>
            </>
          ) : link.health === "plan" ? (
            <>
              <span className="font-semibold">Your plan no longer includes {link.name}.</span> <span className="text-fg-2">{quoted(uses)} can’t use it.</span>
            </>
          ) : (
            <>
              <span className="font-semibold">{link.name} isn’t connected.</span> <span className="text-fg-2">{quoted(uses)} can’t use it until you connect it.</span>
            </>
          )}
        </Notice>
      ))}
      {credits.length > 0 && (
        <Notice
          action={
            <BtnLink href="/settings/credits" size="sm" variant="primary">
              Add credits
            </BtnLink>
          }
        >
          <span className="font-semibold">You ran out of credits,</span>{" "}
          <span className="text-fg-2">so {quoted(credits)} {credits.length === 1 ? "is" : "are"} paused. They come back on by themselves when credits are added.</span>
        </Notice>
      )}
      {failed.map((automation) => {
        const app = automation.preset === "pr_review" ? "github" : automation.trigger?.app;
        return (
          <Notice
            key={automation.id}
            action={
              <BtnLink href={INTEGRATIONS_APPS_PATH} size="sm" variant="primary">
                {app ? `Check ${titleCase(app)}` : "Check your apps"}
              </BtnLink>
            }
          >
            <span className="font-semibold">“{automation.preset === "pr_review" ? (reviewedRepo(automation) ?? automation.title) : automation.title}” failed a few times in a row,</span>{" "}
            <span className="text-fg-2">so it was paused. Fix the cause, then turn it back on with its switch.</span>
          </Notice>
        );
      })}
      {flow.dialog}
    </div>
  );
}

// ---------------------------------------------------------------- one row

function LastRun({ row }: { row: Row }) {
  const status = lastRunStatus(row.automation, row.run);
  return (
    <span className={cn(T3, "flex min-w-0 items-center gap-2 text-fg-2")}>
      <Dot tone={status.tone} />
      <span className="min-w-0">
        <span className="sr-only">Last run: </span>
        {status.text}
        {status.tone === "warn" && (
          <>
            {" · "}
            <Link href={status.approvalId ? `/approvals?approval=${encodeURIComponent(status.approvalId)}` : "/approvals"} className="font-medium text-accent-dark hover:text-fg">
              Review
            </Link>
          </>
        )}
      </span>
    </span>
  );
}

function AutomationRow({ row, timezone }: { row: Row; timezone: string | null | undefined }) {
  const { automation } = row;
  const update = useUpdateAutomation();
  const remove = useDeleteAutomation();
  const disable = useDisablePrReview();
  const runOnce = useRunOnce();
  const review = automation.preset === "pr_review";
  const finished = isFinished(automation);
  const on = automation.enabled;
  const title = rowTitle(automation);
  const repo = rowRepo(automation);
  const name = repo ? `${title} in ${repo}` : title;
  const href = automationHref(automation.id);
  const quiet = !on || finished;
  const chip = row.needs && row.needs.label !== "Waiting for your OK" ? row.needs.label : null;

  const items = review
    ? [
        { label: "Change", icon: <PencilIcon size={16} />, href },
        { label: "See verdicts in the chat", icon: <ChatIcon size={16} />, href: AUTOMATIONS_CHAT_HREF },
        ...(repo
          ? [
              {
                label: "Turn off review",
                icon: <TrashIcon size={16} />,
                pending: disable.isPending,
                confirm: { title: `Turn off review for ${repo}?`, body: "Patch stops reviewing it, and the OK to comment there ends.", label: "Turn off" },
                onSelect: () => {
                  const [owner, name] = repo.split("/");
                  disable.mutate({ owner, repo: name }, { onError: (error) => toastError(`Couldn’t turn off review for ${repo}`, error) });
                },
              },
            ]
          : []),
      ]
    : [
        ...(finished ? [] : [{ label: "Change", icon: <PencilIcon size={16} />, href }, { label: "Run once now", icon: <PlayIcon size={16} />, onSelect: () => runOnce.start(automation) }]),
        { label: "See runs in the chat", icon: <ChatIcon size={16} />, href: AUTOMATIONS_CHAT_HREF },
        {
          label: "Delete",
          icon: <TrashIcon size={16} />,
          pending: remove.isPending,
          confirm: { title: `Delete “${automation.title}”?`, body: "It stops running and is gone for good. Its runs stay in the Automations chat.", label: "Delete for good" },
          onSelect: () => remove.mutate(automation.id, { onError: (error) => toastError(`Couldn’t delete “${automation.title}”`, error) }),
        },
      ];

  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-t border-line px-4 py-4 transition-colors hover:bg-[#fbfaf7] @min-[880px]:items-center @min-[880px]:gap-4 @min-[880px]:px-6", GRID)}>
      <LogoStack marks={rowApps(automation)} dim={quiet} names={new Map(row.links.map((link) => [link.slug, link.name]))} icons={new Map(row.links.map((link) => [link.slug, link.app?.iconUrl ?? null]))} className="col-span-2 @min-[880px]:col-span-1" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Link href={href} className={cn(T2, "font-semibold break-words transition-colors hover:text-accent-dark", quiet ? "text-muted" : "text-fg")}>
            {title}
          </Link>
          {repo && <Chip mono>{repo}</Chip>}
          {chip && <Chip tone="warn">{chip}</Chip>}
          {finished && <Chip>Done</Chip>}
        </span>
        <span className={cn(T3, "text-muted")}>{rowLine(automation, timezone)}</span>
      </div>
      <span className="col-span-2 @min-[880px]:col-span-1">
        <LastRun row={row} />
      </span>
      <span className={cn(T3, "col-span-2 min-w-0 @min-[880px]:col-span-1", on ? "text-fg-2" : "text-muted")}>
        <span className="@min-[880px]:sr-only">Next run: </span>
        {finished ? "None: it ran its one time" : nextRunText(automation)}
      </span>
      <span className="col-start-2 row-start-2 flex items-center justify-end gap-1 @min-[880px]:col-start-auto @min-[880px]:row-start-auto">
        {!finished && (
          <Switch
            on={on}
            label={`${on ? "Pause" : "Resume"} ${name}`}
            disabled={update.isPending || remove.isPending || disable.isPending}
            onToggle={() => update.mutate({ automationId: automation.id, enabled: !on }, { onError: (error) => toastError(`Couldn’t ${on ? "pause" : "resume"} “${name}”`, error) })}
          />
        )}
        <MoreMenu label={`More for ${name}`} items={items} />
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- the list

function SkeletonRows() {
  return (
    <ul aria-hidden>
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-4 border-t border-line px-6 py-4">
          <span className="h-7 w-[84px] animate-pulse rounded-lg bg-surface-2" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-4 w-2/5 animate-pulse rounded bg-surface-2" />
            <span className="h-3 w-3/5 animate-pulse rounded bg-surface-2" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function FilterButton({ on, onClick, children, count, warn }: { on: boolean; onClick: () => void; children: ReactNode; count: number; warn?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        T3,
        "inline-flex h-8 items-center gap-2 rounded-full px-3 font-medium transition-colors",
        on ? "bg-fg text-white" : "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-bg",
      )}
    >
      {children}
      {warn && count > 0 ? (
        <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 font-semibold text-warn", on ? "bg-white" : "bg-warn-soft shadow-[inset_0_0_0_1px_var(--warn-line)]")}>{count}</span>
      ) : (
        <span className={on ? "text-[#bdb8ae]" : "text-muted"}>{count}</span>
      )}
    </button>
  );
}

/** Nothing made yet: how one comes to exist, and the two ways in. */
function NoneYet() {
  return (
    <div className="flex flex-wrap items-center gap-6 px-6 py-8">
      <AgentFigure who="tex" mood="ready" size={72} label="" className="shrink-0 max-sm:hidden" />
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
        <h3 className={cn(T2, "font-semibold")}>You haven’t made one yet</h3>
        <p className={cn(T3, "text-muted")}>
          Ask Tex in plain words and it shows you a draft to save, or build one yourself on the canvas with New automation. Nothing runs before you save it.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <BtnLink href="/automations/new" variant="primary">
          <PlusIcon size={16} />
          New automation
        </BtnLink>
        <BtnLink href="/">
          <ChatIcon size={16} />
          Ask Tex
        </BtnLink>
      </div>
    </div>
  );
}

export function AutomationsList() {
  const automations = useAutomations();
  const me = useMe();
  const apps = useApps();
  const plan = usePlanAutomations();
  const chat = useAutomationsChat().data ?? null;
  const unread = useAutomationsUnread(chat, false);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [query, setQuery] = useState("");
  const timezone = me.data?.timezone;
  const all = useMemo(() => automations.data ?? [], [automations.data]);
  // Only one with steps has runs to look at: its latest says whether a step waits for an OK.
  const runs = useLatestRuns(all.filter((automation) => hasSteps(automation) && automation.preset !== "pr_review" && automation.lastRunAt).map((automation) => automation.id));

  const rows: Row[] = useMemo(
    () =>
      all.map((automation) => {
        const links = automationApps(automation, apps.data);
        const broken = brokenApps(links);
        const run = runs.get(automation.id);
        return { automation, links, broken, run, needs: needsYou(automation, broken, run?.state === "waiting") };
      }),
    [all, apps.data, runs],
  );
  const searched = rows.filter((row) => matchesSearch(row.automation, query, row.links.map((link) => link.name)));
  const shown = searched.filter((row) => inFilter(row.automation, filter, row.needs !== null));
  const count = (which: ListFilter) => rows.filter((row) => inFilter(row.automation, which, row.needs !== null)).length;
  const full = plan && automations.data && all.length >= plan.limit ? plan : null;
  const none = automations.isSuccess && all.length === 0;

  return (
    <div className="type-scale scroll-pane min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 pt-6 pb-12 md:px-8 md:pt-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className={T1}>Automations</h1>
            <p className={cn(T2, "text-muted")}>
              {automations.data ? listHeadline(all, plan) : " "}
              {full?.canUpgrade && (
                <>
                  {" · "}
                  <Link href={PRICING_PATH} className="font-medium text-accent-dark hover:text-fg">
                    Upgrade
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BtnLink href="/">
              <ChatIcon size={16} />
              Ask Tex
            </BtnLink>
            <BtnLink href="/automations/new" variant="primary">
              <PlusIcon size={16} />
              New automation
            </BtnLink>
          </div>
        </header>

        <Notices rows={rows} />

        <DraftsWaiting timezone={timezone} />

        <section aria-labelledby="your-automations" className="flex min-w-0 flex-col gap-4">
          <h2 id="your-automations" className="sr-only">
            Your automations
          </h2>
          {!none && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
                <FilterButton on={filter === "all"} onClick={() => setFilter("all")} count={rows.length}>
                  All
                </FilterButton>
                <FilterButton on={filter === "schedule"} onClick={() => setFilter("schedule")} count={count("schedule")}>
                  On a schedule
                </FilterButton>
                <FilterButton on={filter === "event"} onClick={() => setFilter("event")} count={count("event")}>
                  When something happens
                </FilterButton>
                <FilterButton on={filter === "needs"} onClick={() => setFilter("needs")} count={count("needs")} warn>
                  Needs you
                </FilterButton>
              </div>
              <label className="flex h-9 w-[280px] max-w-full items-center gap-2 rounded-[10px] bg-surface px-3 shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_2px_var(--accent)]">
                <SearchIcon size={16} className="shrink-0 text-muted" />
                <span className="sr-only">Search automations</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search automations"
                  className={cn(T2, "min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted")}
                />
              </label>
            </div>
          )}

          <div className="@container rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
            {automations.isError ? (
              <div className="p-6">
                <ErrorState error={automations.error} onRetry={() => void automations.refetch()} />
              </div>
            ) : automations.isPending ? (
              <SkeletonRows />
            ) : none ? (
              <NoneYet />
            ) : (
              <ul aria-label="Your automations">
                <li aria-hidden className={cn(T3, "hidden gap-4 px-6 py-3 font-medium text-muted @min-[880px]:grid", GRID)}>
                  <span>Apps</span>
                  <span>Automation</span>
                  <span>Last run</span>
                  <span>Next run</span>
                  <span className="text-right">On</span>
                </li>
                {shown.map((row) => (
                  <AutomationRow key={row.automation.id} row={row} timezone={timezone} />
                ))}
                {shown.length === 0 && (
                  <li className={cn(T2, "border-t border-line px-6 py-8 text-muted")}>
                    {query.trim() ? `Nothing matches “${query.trim()}”.` : filter === "needs" ? "Nothing needs you right now." : "None of this kind yet. The templates below have one to start from."}
                  </li>
                )}
              </ul>
            )}
          </div>

          {!none && (
            <p className={cn(T3, "max-w-[72ch] text-muted")}>
              {AUTOMATION_CREDITS} An automation pauses on its own if you run out of credits. Results land in your{" "}
              <Link href={AUTOMATIONS_CHAT_HREF} className="font-medium text-accent-dark hover:text-fg">
                Automations chat
                {unread && <span aria-hidden className="ml-1 inline-block size-2 rounded-full bg-accent align-middle" />}
                {unread && <span className="sr-only"> (new runs)</span>}
              </Link>
              .
              {timezone && (
                <>
                  {" "}
                  “Your time” is {timezone}; change it in{" "}
                  <Link href="/settings" className="font-medium text-accent-dark hover:text-fg">
                    Settings
                  </Link>
                  .
                </>
              )}
            </p>
          )}
        </section>

        <section aria-labelledby="templates" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="templates" className={cn(T2, "font-semibold")}>
              Start from a template
            </h2>
            <Link href="/automations/new#templates" className={cn(T3, "font-medium text-accent-dark hover:text-fg")}>
              See all
            </Link>
          </div>
          {full && <PlanFullNote full={full} />}
          <TemplateCards ids={LIST_TEMPLATES} />
        </section>
      </div>
    </div>
  );
}
