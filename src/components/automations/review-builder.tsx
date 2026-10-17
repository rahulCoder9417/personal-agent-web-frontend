"use client";

// Pull-request review on the canvas: the same page as any automation, with its boxes fixed. A pull
// request opens or gets new commits on GitHub → GitHub's changes are read → Patch reviews them →
// Patch's review is posted on the pull request → the verdict goes to the Automations chat. The
// trigger's settings hold the repo (and, for a new one, turning review on for it), what it needs,
// GitHub's connection, pause, resume and turn off, and the way to have one pull request reviewed
// once in the chat. Each repo with review on is an automation (`preset: pr_review`), turned on and
// off with `/v1/pr-reviews`.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { refusedTypedValue } from "@/lib/action-errors";
import type { Automation } from "@/lib/api/client";
import { useApps, useCrew, useDisablePrReview, useEnablePrReview, useGithubRepos, useMe, usePlans, usePrReviews, useUpdateAutomation } from "@/lib/api/hooks";
import { laneDiagram } from "@/lib/automation-lanes";
import { automationHref, reviewedRepo } from "@/lib/automation-flow";
import { chatDraftHref } from "@/lib/chat-link";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { CREW_EXAMPLES } from "@/lib/crew";
import { CREW_HELP_PATH } from "@/lib/crew-address";
import { ApiError } from "@/lib/api/client";
import { cn, formatAgo, formatDate } from "@/lib/format";
import { connectedReturnPath, INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { describeDisableError, describeEnableError, describeReviewState, parseRepo, repoName, verdictPlace, type PlanContext, type RepoRef, type ReviewError } from "@/lib/pr-review";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { isConnectable } from "../apps/apps-logic";
import { useConnectDialog } from "../apps/connect-dialog";
import { ChatIcon, TrashIcon } from "../icons";
import { toast, toastError } from "../toast";
import { Switch } from "../ui";
import { Details, HealthChip, InspectorBody, InspectorHeader, PanelSection } from "./inspector";
import type { CanvasBox, CanvasHead } from "./lane-canvas";
import { RepoPicker, type PickerStatus } from "./repo-picker";
import { Btn, BtnLink, Chip, ChevronLink, Crumbs, Dot, MoreMenu, Notice, T2, T3 } from "./parts";

const LaneCanvas = dynamic(() => import("./lane-canvas"), { ssr: false, loading: () => <div aria-hidden className="h-full min-h-[320px] animate-pulse bg-bg" /> });

/** The fixed boxes: read the changes, Patch reviews them, post the review. */
const DIAGRAM = laneDiagram([{ id: "changes" }, { id: "patch" }, { id: "comment" }], ["read", "tex", "write"]);

const HEADS: CanvasHead[] = [
  { before: "trigger", text: "Start when" },
  { before: "step:changes", text: "Read" },
  { before: "step:patch", text: "Tex and the crew" },
  { before: "step:comment", text: "Write" },
];

/** What each fixed box does, for its settings. */
const ABOUT: Record<string, { label: string; title: string; details: { label: string; value: string }[]; note?: string }> = {
  "step:changes": {
    label: "Read · GitHub",
    title: "Get the changes",
    details: [{ label: "What", value: "The pull request’s diff and the files it changes, from GitHub." }],
    note: "Reading is free and changes nothing on GitHub.",
  },
  "step:patch": {
    label: "Crew · Patch",
    title: "Patch reviews the changes",
    details: [
      { label: "Who", value: "Patch, the crew’s reviewer" },
      { label: "What", value: "Reads the changes, looks for bugs, security problems and missing tests, and writes one review with a verdict: looks good, small fixes, or needs work." },
    ],
    note: "Each new commit is reviewed once. Patch never merges and never approves.",
  },
  "step:comment": {
    label: "Write or send · GitHub",
    title: "Comment on the pull request",
    details: [
      { label: "What", value: "Posts Patch’s review on the pull request." },
      { label: "Asks you first", value: "No: turning review on is your OK for a review or a comment on a pull request in this repo. Merging, approving, closing or anything in another repo still waits for your OK." },
    ],
    note: "A review costs what any job costs, plus 1 credit for the review Patch posts.",
  },
};

/** "5 min ago", "yesterday", "12 Sep": formatAgo, but fit for the middle of a sentence. */
function ago(iso: string): string {
  const text = formatAgo(iso);
  return text === "Yesterday" ? "yesterday" : text;
}

/** What the plan allows, so a refusal can say "Your Pro plan allows 5 automations". */
function usePlanContext(): PlanContext {
  const me = useMe();
  const plans = usePlans();
  const plan = plans.data?.plans.find((item) => item.id === me.data?.plan);
  if (!plan) return {};
  return { planName: plan.name, automations: plan.limits.automations, canUpgrade: plans.data?.plans.some((item) => item.limits.automations > plan.limits.automations) ?? false };
}

/** GitHub as the Apps screen knows it: connected and working, expired, or not connected at all. */
function useGitHub() {
  const apps = useApps();
  const app = apps.data?.find((item) => item.slug === "github") ?? null;
  if (!apps.data) return { state: apps.isError ? ("connected" as const) : ("loading" as const), app }; // Can't tell: let the API answer.
  const connections = app?.connections ?? [];
  if (connections.some((connection) => connection.status === "active")) return { state: "connected" as const, app };
  return { state: connections.length > 0 ? ("expired" as const) : ("missing" as const), app };
}

/** Review can't run without GitHub: said in amber, with the way to connect or reconnect it. */
function GitHubNotice() {
  const github = useGitHub();
  const flow = useConnectDialog({ returnPath: (app) => connectedReturnPath(app.slug) });
  if (github.state !== "missing" && github.state !== "expired") return null;
  const label = github.state === "expired" ? "Reconnect GitHub" : "Connect GitHub";
  return (
    <>
      <Notice
        action={
          github.app && isConnectable(github.app) ? (
            <Btn size="sm" variant="primary" onClick={() => github.app && flow.open(github.app, github.state === "expired" ? "reconnect" : "connect")}>
              {label}
            </Btn>
          ) : (
            <BtnLink href={INTEGRATIONS_APPS_PATH} size="sm" variant="primary">
              {label}
            </BtnLink>
          )
        }
      >
        <span className="font-semibold">{github.state === "expired" ? "GitHub needs reconnecting." : "GitHub isn’t connected."}</span>{" "}
        <span className="text-fg-2">Patch needs it to see your pull requests and comment on them.</span>
      </Notice>
      {flow.dialog}
    </>
  );
}

function Refusal({ error }: { error: ReviewError }) {
  return (
    <p role="alert" className={cn(T3, "flex flex-col items-start gap-1 rounded-xl bg-warn-soft px-4 py-3 text-warn shadow-[inset_0_0_0_1px_var(--warn-line)]")}>
      <span>{error.message}</span>
      {error.link && (
        <Link href={error.link.href} className="font-medium underline underline-offset-2">
          {error.link.label}
        </Link>
      )}
    </p>
  );
}

/** A new repo: typed as owner/repo or pasted as a GitHub link, and review turned on for it. */
function RepoForm() {
  const router = useRouter();
  const enable = useEnablePrReview();
  const plan = usePlanContext();
  const github = useGitHub();
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<RepoRef | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  // The repo the last request was for, so its answer names it even after the field has changed.
  const [asked, setAsked] = useState("");
  const id = useId();
  const blocked = github.state === "missing" || github.state === "expired";
  const repos = useGithubRepos(github.state === "connected");
  const reviews = usePrReviews().data;
  const reviewed = useMemo(() => reviews ?? [], [reviews]);
  const status: PickerStatus = repos.isError ? (repos.error instanceof ApiError && repos.error.status === 409 ? "connect" : "error") : repos.data ? "ready" : blocked ? "ready" : "loading";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (enable.isPending || blocked) return;
    const parsed = chosen ? { ok: true as const, repo: chosen } : text.trim() ? parseRepo(text) : { ok: false as const, error: "Pick a repo from the list, or type owner/repo." };
    if (!parsed.ok) {
      setInvalid(parsed.error);
      return;
    }
    setInvalid(null);
    const name = repoName(parsed.repo);
    setAsked(name);
    enable.mutate(parsed.repo, {
      onSuccess: (review) => {
        toast({ title: `Review is on for ${repoName(review)}`, body: "Patch reviews its next pull request." });
        router.push(automationHref(review.id));
      },
      onError: (error) => {
        // What the API says about the repo as typed stays under the field; the rest is a toast.
        if (refusedTypedValue(error)) return;
        const refusal = describeEnableError(error, name, plan);
        toastError(`Couldn’t turn on review for ${name}`, refusal.message, refusal.link);
      },
    });
  };
  const repoRefused = refusedTypedValue(enable.error) ? describeEnableError(enable.error, asked, plan) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-label="Turn on review for a repo">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-repo`} className={cn(T2, "font-medium")}>
          Repo
        </label>
        <RepoPicker
          id={id}
          status={status}
          repos={repos.data ?? []}
          reviewed={reviewed}
          query={text}
          onQuery={(value) => {
            setText(value);
            setChosen(null);
            setInvalid(null);
            if (enable.isError) enable.reset();
          }}
          chosen={chosen}
          onChoose={(repo) => {
            setChosen(repo);
            setInvalid(null);
            if (enable.isError) enable.reset();
          }}
          disabled={blocked}
          invalid={Boolean(invalid)}
        />
        {chosen && (
          <p className={cn(T3, "text-fg-2")}>
            Selected: <span className="font-mono">{repoName(chosen)}</span>
          </p>
        )}
        {invalid ? (
          <p role="alert" className={cn(T3, "text-warn")}>
            {invalid}
          </p>
        ) : (
          <p className={cn(T3, "text-muted")}>
            {blocked ? (github.state === "expired" ? "Reconnect GitHub first." : "Connect GitHub first.") : "Like acme/website, or paste the repo’s GitHub link."} Your GitHub account
            needs admin access to it. Each repo you review counts as one automation on your plan.
          </p>
        )}
      </div>
      {repoRefused && <Refusal error={repoRefused} />}
      <Btn type="submit" variant="primary" pending={enable.isPending} disabled={blocked || github.state === "loading"} className="self-start">
        Turn on review
      </Btn>
    </form>
  );
}

/** One repo with review on: its repo, whether it is watched (or why it is paused), and Turn off. */
function RepoSettings({ automation }: { automation: Automation }) {
  const router = useRouter();
  const review = usePrReviews().data?.find((item) => item.id === automation.id);
  const remove = useDisablePrReview();
  const repo = review ? repoName(review) : reviewedRepo(automation);
  const state = describeReviewState({ enabled: automation.enabled, pausedReason: automation.pausedReason ?? null });
  const [armed, setArmed] = useState(false);
  const turnOff = () => {
    if (!repo) return;
    const [owner, name] = repo.split("/");
    remove.mutate(
      { owner, repo: name },
      {
        onSuccess: () => {
          toast({ title: `Review is off for ${repo}`, body: "Patch stops reviewing it, and the OK to comment there ends." });
          router.push("/automations");
        },
        onError: (error) => {
          // A repo that was already off is not worth an error (describeDisableError says nothing).
          const why = describeDisableError(error);
          if (why) toastError(`Couldn’t turn off review for ${repo}`, why);
          else router.push("/automations");
        },
      },
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <span className={cn(T2, "font-medium")}>Repo</span>
      <div className="flex min-h-10 items-center gap-2 rounded-[10px] px-3 shadow-[inset_0_0_0_1px_var(--line-strong)]">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{repo ?? "A GitHub repo"}</span>
        {automation.enabled ? (
          <span className={cn(T3, "flex items-center gap-1 font-medium text-success")}>
            <Dot tone="ok" size={6} />
            Watching
          </span>
        ) : (
          <span className={cn(T3, "font-medium", state.tone === "danger" ? "text-warn" : "text-muted")}>Paused</span>
        )}
      </div>
      <p className={cn(T3, "text-muted")}>Your GitHub account needs admin access to it. Each repo you review counts as one automation on your plan.</p>
      {state.why && (
        <p className={cn(T3, "flex flex-wrap items-center gap-x-2 gap-y-1", state.tone === "danger" ? "text-warn" : "text-muted")}>
          <span>{state.why}</span>
          {state.fix && (
            <Link href={state.fix.href} className="font-medium text-accent-dark hover:text-fg">
              {state.fix.label}
            </Link>
          )}
        </p>
      )}
      <p className={cn(T3, "text-muted")}>
        The verdict goes to {review ? verdictPlace(review.channel) : "the Automations chat"} · {automation.lastRunAt ? `last review ${ago(automation.lastRunAt)}` : "no review yet"}
        {review ? ` · on since ${formatDate(review.createdAt)}` : ""}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {armed ? (
          <>
            <Btn size="sm" variant="remove" className="bg-surface-2" pending={remove.isPending} onClick={turnOff}>
              Turn off review
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setArmed(false)}>
              Keep it
            </Btn>
          </>
        ) : (
          <Btn size="sm" variant="remove" onClick={() => setArmed(true)} aria-label={`Turn off review for ${repo ?? "this repo"}`}>
            <TrashIcon size={14} />
            Turn off
          </Btn>
        )}
      </div>
      <p className={cn(T3, "text-muted")}>Pausing stops its reviews and takes back the OK to comment there. Turning it off removes it.</p>
    </div>
  );
}

function OnePullRequest() {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-bg p-4">
      <span className={cn(T2, "font-medium")}>Just one pull request?</span>
      <span className={cn(T3, "text-fg-2")}>Ask Tex in chat with the repo and the number. Patch reviews it once, no automation needed.</span>
      <ChevronLink href={chatDraftHref(CREW_EXAMPLES.patch)} aria-label={`Try it in chat: ${CREW_EXAMPLES.patch}`} className="mt-1">
        Try it in chat
      </ChevronLink>
    </div>
  );
}

/**
 * Pull-request review's canvas: `automation` is a repo with review on; null is a new one, to pick
 * the repo and turn review on.
 */
export function ReviewBuilder({ automation }: { automation: Automation | null }) {
  const compact = !useMediaQuery(SHOWN_AT.sidebar);
  const update = useUpdateAutomation();
  const remove = useDisablePrReview();
  const router = useRouter();
  const patch = useCrew().data?.find((member) => member.id === "patch");
  const github = useGitHub();
  const [selected, setSelected] = useState("trigger");
  const repo = automation ? reviewedRepo(automation) : null;

  const boxes = useMemo(() => {
    const map = new Map<string, CanvasBox>();
    map.set("trigger", {
      key: "trigger",
      logo: "github",
      label: "GitHub",
      title: "A pull request opens or gets new commits",
      line: "GitHub · starts each review",
      chips: repo ? [{ text: repo, mono: true }] : [{ text: "Pick a repo", tone: "warn" }],
      dim: automation ? !automation.enabled : false,
    });
    map.set("step:changes", { key: "step:changes", logo: "github", label: "Step 1 · GitHub", title: "Get the changes", line: "Step 1 · Reads from GitHub", chips: [{ text: "The diff and files" }] });
    map.set("step:patch", { key: "step:patch", logo: "patch", label: "Step 2 · Crew", title: "Patch reviews the changes", line: "Step 2 · Writes a review with a verdict", chips: [{ text: "Never merges" }] });
    map.set("step:comment", { key: "step:comment", logo: "github", label: "Step 3 · GitHub", title: "Comment on the pull request", line: "Step 3 · Writes in GitHub", chips: [{ text: "Posts Patch’s review" }, { text: "1 credit per comment" }] });
    return map;
  }, [repo, automation]);

  const state = automation ? describeReviewState({ enabled: automation.enabled, pausedReason: automation.pausedReason ?? null }) : null;

  let panel: ReactNode;
  if (selected === "trigger") {
    panel = (
      <>
        <InspectorHeader
          kind="trigger"
          logo="github"
          label="Start when · GitHub"
          title="A pull request opens or gets new commits"
          status={<HealthChip health={github.state === "connected" ? "ok" : github.state === "expired" ? "reconnect" : github.state === "missing" ? "connect" : undefined} />}
        />
        <InspectorBody>
          <GitHubNotice />
          <PanelSection title="Review">
            {automation ? <RepoSettings automation={automation} /> : <RepoForm />}
            <p className={cn(T3, "text-muted")}>Turning it on is your OK for Patch to comment on pull requests in this repo. Merging and anything else risky still ask first.</p>
            {patch && !patch.available && (
              <p role="status" className={cn(T3, "rounded-xl bg-surface-2 px-4 py-3 text-fg-2")}>
                Patch isn’t on the crew here yet, so reviews may not run until it is.{" "}
                <Link href={CREW_HELP_PATH} className="font-medium text-accent-dark hover:text-fg">
                  About the crew
                </Link>
              </p>
            )}
          </PanelSection>
          <PanelSection title="One pull request">
            <OnePullRequest />
          </PanelSection>
        </InspectorBody>
      </>
    );
  } else if (selected === "results") {
    panel = (
      <>
        <InspectorHeader kind="end" logo="chat" label="Results" title="Automations chat" />
        <InspectorBody>
          <Details
            details={[
              { label: "Where", value: "Each verdict lands in your Automations chat. With Telegram linked, a copy goes there too." },
              { label: "What", value: "A short verdict, with a link to Patch’s review on the pull request." },
            ]}
            note="To follow up on a review, write in the Automations chat: Tex has the runs in mind there."
          />
        </InspectorBody>
      </>
    );
  } else {
    const about = ABOUT[selected];
    panel = (
      <>
        <InspectorHeader kind={selected === "step:patch" ? "tex" : selected === "step:comment" ? "write" : "read"} logo={selected === "step:patch" ? "patch" : "github"} label={about.label} title={about.title} />
        <InspectorBody>
          <Details details={about.details} note={about.note} />
        </InspectorBody>
      </>
    );
  }

  const menu = automation
    ? [
        { label: "See verdicts in the chat", icon: <ChatIcon size={16} />, href: AUTOMATIONS_CHAT_HREF },
        ...(repo
          ? [
              {
                label: "Turn off review",
                icon: <TrashIcon size={16} />,
                pending: remove.isPending,
                confirm: { title: `Turn off review for ${repo}?`, body: "Patch stops reviewing it, and the OK to comment there ends.", label: "Turn off" },
                onSelect: () => {
                  const [owner, name] = repo.split("/");
                  remove.mutate(
                    { owner, repo: name },
                    {
                      onSuccess: () => router.push("/automations"),
                      onError: (error) => {
                        const why = describeDisableError(error);
                        if (why) toastError(`Couldn’t turn off review for ${repo}`, why);
                      },
                    },
                  );
                },
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="type-scale flex min-h-0 flex-1 flex-col bg-bg">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-surface px-4 py-3 md:min-h-16 md:px-6">
        <div className="flex min-w-0 flex-[1_1_280px] flex-wrap items-center gap-x-3 gap-y-2">
          <Crumbs className={T2} parts={[{ href: "/automations", label: "Automations" }]} current="Review pull requests" />
          {repo && <Chip mono>{repo}</Chip>}
          {automation && state ? (
            <>
              <Chip tone={automation.enabled ? "ok" : state.tone === "danger" ? "warn" : "neutral"}>
                {automation.enabled && <Dot tone="ok" size={6} />}
                {automation.enabled ? "On" : state.tone === "danger" ? (automation.pausedReason === "out_of_credits" ? "Paused: out of credits" : "Paused after failures") : "Paused"}
              </Chip>
              <Switch
                on={automation.enabled}
                size="sm"
                label={`${automation.enabled ? "Pause" : "Resume"} review for ${repo ?? automation.title}`}
                disabled={update.isPending || remove.isPending}
                // A repo is paused and resumed as the automation it is.
                onToggle={() =>
                  update.mutate(
                    { automationId: automation.id, enabled: !automation.enabled },
                    { onError: (error) => toastError(`Couldn’t ${automation.enabled ? "pause" : "resume"} review for ${repo ?? automation.title}`, error) },
                  )
                }
              />
              <span className={cn(T3, "text-muted")}>{automation.lastRunAt ? `Last review ${ago(automation.lastRunAt)}` : "No review yet"}</span>
            </>
          ) : (
            <Chip>
              <Dot tone="warn" size={6} />
              Not on yet
            </Chip>
          )}
        </div>
        {menu.length > 0 && <MoreMenu label="More for this review" items={menu} />}
      </header>
      <div className="@container/builder flex min-h-0 flex-1 flex-col overflow-y-auto @min-[1040px]/builder:overflow-hidden">
        <div className="grid min-h-0 flex-1 grid-cols-1 @min-[1040px]/builder:grid-cols-[minmax(0,1fr)_400px] @min-[1040px]/builder:grid-rows-[minmax(0,1fr)]">
          <section aria-label="Canvas" className={cn("relative min-w-0 bg-bg", compact ? "" : "h-[720px] @min-[1040px]/builder:h-auto")}>
            <LaneCanvas
              diagram={DIAGRAM}
              boxes={boxes}
              empties={new Map()}
              results={{ title: "Automations chat", line: "The verdict goes to" }}
              heads={HEADS}
              conditions={new Map()}
              selected={selected}
              count={3}
              editing={false}
              compact={compact}
              dragging={null}
              onSelect={setSelected}
              onRemove={() => {}}
              onSkip={() => {}}
              onPlus={() => {}}
              onDrop={() => {}}
              onDropTrigger={() => {}}
              label="Pull-request review, step by step"
            />
          </section>
          <aside aria-label="Settings for the open box" className="flex min-w-0 flex-col border-t border-line bg-surface @min-[1040px]/builder:overflow-y-auto @min-[1040px]/builder:border-t-0 @min-[1040px]/builder:border-l">
            {panel}
          </aside>
        </div>
      </div>
    </div>
  );
}
