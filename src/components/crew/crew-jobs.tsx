"use client";

// Crew jobs on the Crew screen: "Give Patch a review" and "Give Byte a job", a form for the brief,
// and the jobs with their state and, once done, the report. A server from before crew jobs answers
// 404, and then none of this is shown.

import Link from "next/link";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, type CrewJob, type CrewMember } from "@/lib/api/client";
import { useChannels, useCreateCrewJob, useCrewJobs, useGithubRepos } from "@/lib/api/hooks";
import {
  briefFrom,
  describeCreateError,
  emptyForm,
  FOCUS_OPTIONS,
  isActive,
  jobState,
  jobTarget,
  jobTitle,
  MEMBER_NAME,
  memberOf,
  notOnServer,
  pullRequestReport,
  reportPlaces,
  type FormErrors,
  type JobForm,
  type JobMember,
  type JobTarget,
} from "@/lib/crew-jobs";
import { cn, formatAgo } from "@/lib/format";
import { parseRepo } from "@/lib/pr-review";
import { DrawnText } from "../chat/agent-bubble";
import { Combobox, Select } from "../select";
import { AgentFigure } from "../tex";
import { toast, toastError } from "../toast";
import { Button, Card, Field, FilterPills, inputClass, Meta, Pill, SkeletonRows, Spinner } from "../ui";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";

const COLOUR: Record<JobMember, string> = { patch: "var(--patch)", byte: "var(--byte)" };

const textareaClass = cn(inputClass, "h-auto min-h-[76px] resize-y py-2 leading-[1.45]");

/** A tick box with its label and a quiet line under it. */
function Check({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className={cn("flex items-start gap-2.5 rounded-lg py-1", disabled ? "cursor-default" : "cursor-pointer")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-[3px] size-4 shrink-0 accent-[var(--accent)] disabled:opacity-60"
      />
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-[13.5px]", disabled && !checked && "text-muted")}>{label}</span>
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- the repo

/**
 * The repo: picked from the connected GitHub account's repos when the server can list them, or
 * typed (owner/repo, or a GitHub link, also a pull request's, which fills in its number).
 */
function RepoField({ id, value, onChange, error }: { id: string; value: string; onChange: (value: string) => void; error?: string }) {
  const repos = useGithubRepos();
  const [typing, setTyping] = useState(false);
  const list = useMemo(() => repos.data ?? [], [repos.data]);
  const options = useMemo(
    () =>
      list.map((repo) => ({
        value: repo.fullName,
        label: repo.fullName,
        hint: repo.private ? "Private" : undefined,
        keywords: [repo.owner, repo.name],
      })),
    [list],
  );
  const picking = !typing && options.length > 0;
  const parsed = parseRepo(value);
  const chosen = parsed.ok ? (options.find((option) => option.value.toLowerCase() === `${parsed.repo.owner}/${parsed.repo.repo}`.toLowerCase())?.value ?? null) : null;
  const notConnected = repos.error instanceof ApiError && repos.error.status === 409;

  const switchLink = (label: string, to: boolean) => (
    <button type="button" onClick={() => setTyping(to)} className="font-medium text-accent hover:text-accent-dark">
      {label}
    </button>
  );
  const hint = notConnected ? (
    <>
      GitHub isn’t connected.{" "}
      <Link href={INTEGRATIONS_APPS_PATH} className="font-medium text-accent hover:text-accent-dark">
        Connect it in Integrations
      </Link>
      .
    </>
  ) : picking ? (
    <>Your GitHub repos, the latest pushed first. Not there? {switchLink("Type it instead", true)}</>
  ) : (
    <>
      Like acme/website, or paste a GitHub link. A pull request’s link fills in its number.
      {options.length > 0 && <> {switchLink("Pick from your repos", false)}</>}
    </>
  );

  // Like Field, but the way to switch between picking and typing stays under an error too.
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium">
        Repository
      </label>
      {picking ? (
        <Combobox
          id={id}
          label="Repository"
          value={chosen}
          options={options}
          onChange={onChange}
          placeholder="Search your repos"
          emptyText={(query) => `No repo matches “${query}”. Type it instead.`}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(event) => {
            // Typed before the list arrived: it stays a field to type in, and keeps the focus.
            setTyping(true);
            onChange(event.target.value);
          }}
          placeholder="owner/repo"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={cn(inputClass, "font-mono text-[12.5px]")}
        />
      )}
      {error && (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      )}
      <p className="text-[12.5px] text-muted">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------- the form

const PATCH_TARGETS = [
  { value: "pull_request", label: "A pull request" },
  { value: "branch", label: "A branch" },
] as const satisfies readonly { value: JobTarget; label: string }[];

const BYTE_TARGETS = [
  { value: "default", label: "Default branch" },
  { value: "branch", label: "A branch" },
  { value: "pull_request", label: "A pull request" },
] as const satisfies readonly { value: JobTarget; label: string }[];

/** The brief for one member, and what to do with the report. Sends it, and says how it went. */
function JobFormCard({ member, onDone }: { member: JobMember; onDone: () => void }) {
  const channels = useChannels();
  const telegram = channels.data?.find((link) => link.channel === "telegram");
  const [form, setForm] = useState<JobForm>(() => emptyForm(member));
  const [errors, setErrors] = useState<FormErrors>({});
  // One id per brief: sending the same brief twice (a double tap, a retry) makes one job.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const create = useCreateCrewJob();
  const id = useId();
  const name = MEMBER_NAME[member];
  const report = pullRequestReport(form);

  const set = <K extends keyof JobForm>(key: K, value: JobForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    // A changed brief is a new request.
    setRequestId(crypto.randomUUID());
    if (create.isError) create.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    const brief = briefFrom(form, requestId);
    if (!brief.ok) {
      setErrors(brief.errors);
      return;
    }
    create.mutate(brief.body, {
      onSuccess: (job) => {
        const where = job.reportTo?.channel === "telegram" ? "Telegram" : "web chat";
        toast({ title: member === "patch" ? "Patch has the review" : "Byte has the job", body: `The report comes to ${where} when it’s done.` });
        onDone();
      },
      onError: (error) => {
        const refusal = describeCreateError(error, member);
        if (!refusal.field) toastError(`Couldn’t give ${name} the job`, refusal.message, refusal.link);
      },
    });
  };
  const refusal = create.error ? describeCreateError(create.error, member) : null;

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${COLOUR[member]} 16%, var(--surface))` }}>
            <AgentFigure who={member} glyph size={26} label="" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h3 id={`${id}-title`} className="text-[15px] font-semibold">
              {member === "patch" ? "Give Patch a review" : "Give Byte a job"}
            </h3>
            <Meta>
              {member === "patch"
                ? "Patch clones the repo into a folder of its own, reviews it, runs what you ask, and cleans up after."
                : "Byte works on a new branch in a folder of its own, tests what you ask, pushes, and cleans up after."}
            </Meta>
          </div>
        </div>

        <RepoField id={`${id}-repo`} value={form.repo} onChange={(value) => set("repo", value)} error={errors.repo} />

        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium">{member === "patch" ? "What to review" : "Start from"}</span>
          <FilterPills
            label={member === "patch" ? "What to review" : "Start from"}
            options={member === "patch" ? [...PATCH_TARGETS] : [...BYTE_TARGETS]}
            value={form.target}
            onChange={(value) => set("target", value)}
          />
          {form.target === "pull_request" && (
            <Field label="Pull request" htmlFor={`${id}-pr`} hint="Its number, like 42, or paste its link." error={errors.pullNumber}>
              <input
                id={`${id}-pr`}
                value={form.pullNumber}
                onChange={(event) => set("pullNumber", event.target.value)}
                inputMode="numeric"
                placeholder="42"
                autoComplete="off"
                className={cn(inputClass, "max-w-[220px]")}
              />
            </Field>
          )}
          {form.target === "branch" && (
            <Field label="Branch" htmlFor={`${id}-branch`} hint={member === "patch" ? "Reviewed against the repo’s default branch." : "Byte starts a new branch from it."} error={errors.branch}>
              <input
                id={`${id}-branch`}
                value={form.branch}
                onChange={(event) => set("branch", event.target.value)}
                placeholder="feature/login"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className={cn(inputClass, "max-w-[320px] font-mono text-[12.5px]")}
              />
            </Field>
          )}
        </div>

        <Field
          label={member === "patch" ? "Anything Patch should know" : "What to fix or build"}
          htmlFor={`${id}-instructions`}
          hint={member === "patch" ? "Optional. What to look at closely, what to leave out." : "In your own words, as you’d tell a colleague."}
          error={errors.instructions}
        >
          <textarea
            id={`${id}-instructions`}
            value={form.instructions}
            onChange={(event) => set("instructions", event.target.value)}
            maxLength={4000}
            rows={3}
            placeholder={member === "patch" ? "The discount code changed. Look hard at it." : "Make the signup form keep the email after a wrong password."}
            className={textareaClass}
          />
        </Field>

        {member === "patch" ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[12.5px] font-medium">What to look for</legend>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {FOCUS_OPTIONS.map((option) => (
                <Check
                  key={option.value}
                  label={option.label}
                  hint={option.hint}
                  checked={form.focus.includes(option.value)}
                  onChange={(on) =>
                    set("focus", on ? [...form.focus, option.value] : form.focus.filter((value) => value !== option.value))
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : (
          <Field label="What to test for" htmlFor={`${id}-acceptance`} hint="Optional. The checks that say the job is done; Byte says how each went.">
            <textarea
              id={`${id}-acceptance`}
              value={form.acceptance}
              onChange={(event) => set("acceptance", event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="A wrong password keeps the email in the field."
              className={textareaClass}
            />
          </Field>
        )}

        <Field
          label="Commands to install, test or start the app"
          htmlFor={`${id}-commands`}
          hint={`Optional. Without them ${name} looks for the test command in the repo.`}
        >
          <textarea
            id={`${id}-commands`}
            value={form.commands}
            onChange={(event) => set("commands", event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="pnpm install && pnpm test"
            spellCheck={false}
            className={cn(textareaClass, "font-mono text-[12.5px]")}
          />
        </Field>

        {member === "byte" && (
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium">At the end</span>
            <FilterPills
              label="At the end"
              options={[
                { value: "pull_request", label: "Push and open a pull request" },
                { value: "branch", label: "Only push the branch" },
              ]}
              value={form.finish}
              onChange={(value) => set("finish", value)}
            />
            <Meta>Never the default branch: Byte always pushes a new one.</Meta>
          </div>
        )}

        <fieldset className="flex flex-col gap-1 rounded-xl bg-surface-2 px-3.5 py-3">
          <legend className="sr-only">What to do with the report</legend>
          <span className="mb-1 text-[12.5px] font-medium">What to do with the report</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Check checked disabled label="Send it to me in chat" />
            <div className="min-w-[180px]">
              <Select
                label="The chat"
                value={form.channel}
                onChange={(value) => set("channel", value === "telegram" ? "telegram" : "web")}
                options={[
                  { value: "web", label: "Web chat", description: "In a conversation of its own" },
                  ...(telegram ? [{ value: "telegram", label: "Telegram", hint: telegram.displayId }] : []),
                ]}
                disabled={!telegram}
              />
            </div>
          </div>
          <Check
            checked={form.postOnPullRequest && report.possible}
            disabled={!report.possible}
            onChange={(on) => set("postOnPullRequest", on)}
            label={report.label}
            hint={report.hint}
          />
          <Check checked={form.openIssue} onChange={(on) => set("openIssue", on)} label="Open an issue with it" hint="One issue in the repo. 1 credit, like any app action that changes something." />
          {member === "patch" && form.postOnPullRequest && report.possible && (
            <p className="pt-1 text-[12px] text-muted">
              Ticking this is your OK for Patch to post this one review, on this pull request, for this job only. Merging, approving and anything else risky still ask first.
            </p>
          )}
        </fieldset>

        {refusal?.field && (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {refusal.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" pending={create.isPending}>
            {member === "patch" ? "Give Patch the review" : "Give Byte the job"}
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={create.isPending}>
            Cancel
          </Button>
          <Meta className="basis-full sm:basis-auto">Costs what a turn costs; app actions that change something are 1 credit each.</Meta>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------- the jobs

/** One job: who, what, its state, where the report goes, and the report once it is done. */
function JobRow({ job }: { job: CrewJob }) {
  const member = memberOf(job);
  const state = jobState(job.status);
  const [open, setOpen] = useState(false);
  const target = jobTarget(job);
  const reportId = useId();

  return (
    <li className="flex flex-col gap-2.5 border-b border-surface-2 px-4 py-3.5 last:border-b-0 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${COLOUR[member]} 16%, var(--surface))` }}>
          <AgentFigure who={member} glyph size={22} label={MEMBER_NAME[member]} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-[14px] font-semibold break-words">{jobTitle(job)}</span>
            <Pill tone={state.tone}>
              {job.status === "running" && <Spinner size={11} className="mr-1.5" />}
              {state.label}
            </Pill>
          </div>
          <Meta>
            {[MEMBER_NAME[member], target, reportPlaces(job), formatAgo(job.createdAt)].filter(Boolean).join(" · ")}
          </Meta>
          {job.status === "failed" && job.error && <p className="text-[12.5px] text-danger">{job.error}</p>}
          {job.status === "done" && !job.report && <p className="text-[12.5px] text-muted">No report came back.</p>}
        </div>
        {job.report && (
          <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={reportId} onClick={() => setOpen(!open)}>
            {open ? "Hide report" : "Report"}
          </Button>
        )}
      </div>
      {job.report && open && (
        <div id={reportId} className="ml-11 min-w-0 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] leading-[1.5] break-words">
          <DrawnText text={job.report} />
        </div>
      )}
    </li>
  );
}

/**
 * "Give Patch a review" and "Give Byte a job", the form, and the jobs. Only the members that work
 * here are offered. Hidden on a server that doesn't have crew jobs yet.
 */
export function CrewJobsSection({ crew }: { crew: readonly CrewMember[] }) {
  const jobs = useCrewJobs();
  const [giving, setGiving] = useState<JobMember | null>(null);
  if (jobs.isError && notOnServer(jobs.error)) return null;
  const offered = (["patch", "byte"] as const).filter((id) => crew.some((member) => member.id === id && member.available));
  const working = jobs.data?.some(isActive) ?? false;

  return (
    <section id="crew-jobs" aria-labelledby="crew-jobs-title" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="crew-jobs-title" className="text-[17px] font-semibold tracking-[-0.01em]">
            Give the crew a job
          </h2>
          <p className="max-w-[62ch] text-[13.5px] text-muted">
            Fill in a brief. The job runs as soon as Tex is free, in a folder of its own that is deleted afterwards, and every program it started is stopped. The report comes to your chat and stays here.
          </p>
        </div>
        {offered.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {offered.map((id) => (
              <Button key={id} variant={giving === id ? "primary" : "secondary"} aria-pressed={giving === id} onClick={() => setGiving(giving === id ? null : id)}>
                <AgentFigure who={id} glyph size={18} label="" />
                {id === "patch" ? "Give Patch a review" : "Give Byte a job"}
              </Button>
            ))}
          </div>
        )}
      </div>

      {giving && <JobFormCard key={giving} member={giving} onDone={() => setGiving(null)} />}

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-surface-2 px-4 py-3 sm:px-5">
          <span className="text-[13px] font-semibold">Jobs</span>
          {working && (
            <Meta className="flex items-center gap-1.5">
              <Spinner size={12} /> Updates by itself
            </Meta>
          )}
        </div>
        {jobs.isPending ? (
          <SkeletonRows rows={2} />
        ) : jobs.isError ? (
          <p role="alert" className="px-5 py-4 text-[13px] text-danger">
            The jobs didn’t load. {jobs.error.message}
          </p>
        ) : jobs.data.length === 0 ? (
          <p className="px-5 py-5 text-[13.5px] text-muted">No jobs yet. Give Patch a review or Byte a job, and its report shows up here.</p>
        ) : (
          <ul aria-label="Crew jobs">
            {jobs.data.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
