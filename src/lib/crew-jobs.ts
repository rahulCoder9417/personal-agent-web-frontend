// Crew jobs (`/v1/crew-jobs`): a brief the person fills in for Patch (a review) or Byte (a change).
// It runs as one turn of Tex's crew and ends with a report. Here: the form's state and the brief it
// sends, a job's state and where its report goes in words, and the API's refusals. No React here,
// so it can be tested.

import { ApiError, errorMessage, type CrewJob, type CrewJobFocus, type CrewJobInput } from "./api/client";
import { CHANNEL_LABEL } from "./format";
import { parseRepo, repoName } from "./pr-review";

export type JobMember = "patch" | "byte";

export const MEMBER_NAME: Record<JobMember, string> = { patch: "Patch", byte: "Byte" };

/** What Patch can be asked to look for, in the order the form shows them. */
export const FOCUS_OPTIONS: readonly { value: CrewJobFocus; label: string; hint: string }[] = [
  { value: "bugs", label: "Bugs", hint: "Logic errors, broken edge cases" },
  { value: "security", label: "Security", hint: "Injection, permissions, leaked secrets" },
  { value: "tests", label: "Tests", hint: "Runs them, and says what is untested" },
  { value: "performance", label: "Performance", hint: "Needless work, slow queries" },
  { value: "style", label: "Style", hint: "The project’s own conventions" },
];

/** What the backend uses when no focus is given. */
export const DEFAULT_FOCUS: readonly CrewJobFocus[] = ["bugs", "security", "tests"];

/** Patch reviews a pull request or a branch. Byte starts from the default branch, a branch or a pull request. */
export type JobTarget = "pull_request" | "branch" | "default";

export type JobForm = {
  member: JobMember;
  /** As picked from the list or typed: owner/repo, or a GitHub link (also one to a pull request). */
  repo: string;
  target: JobTarget;
  pullNumber: string;
  branch: string;
  /** Patch: anything to know. Byte: what to fix or build. */
  instructions: string;
  focus: CrewJobFocus[];
  /** Byte: what to test for. */
  acceptance: string;
  commands: string;
  /** Byte: open a pull request at the end, or only push the branch. */
  finish: "pull_request" | "branch";
  channel: "web" | "telegram";
  postOnPullRequest: boolean;
  openIssue: boolean;
};

export function emptyForm(member: JobMember, channel: "web" | "telegram" = "web"): JobForm {
  return {
    member,
    repo: "",
    target: member === "patch" ? "pull_request" : "default",
    pullNumber: "",
    branch: "",
    instructions: "",
    focus: [...DEFAULT_FOCUS],
    acceptance: "",
    commands: "",
    finish: "pull_request",
    channel,
    postOnPullRequest: false,
    openIssue: false,
  };
}

// ---------------------------------------------------------------- reading what was typed

/** "42", "#42" or a pull request's GitHub link → 42. Null for anything else. */
export function pullNumberFrom(text: string): number | null {
  const trimmed = text.trim();
  const link = /\/pull\/(\d{1,9})(?:[/?#]|$)/.exec(trimmed);
  const bare = /^#?(\d{1,9})$/.exec(trimmed);
  const digits = link?.[1] ?? bare?.[1];
  if (!digits) return null;
  const number = Number(digits);
  return number > 0 ? number : null;
}

/** The contract's branch rule, as the backend checks it: letters, digits and . _ - / only. */
export function branchProblem(branch: string): string | null {
  const b = branch.trim();
  if (!b) return "Enter the branch’s name.";
  const bad =
    !/^[A-Za-z0-9._/-]{1,200}$/.test(b) ||
    b.includes("..") ||
    b.includes("//") ||
    b.startsWith("/") ||
    b.startsWith("-") ||
    b.endsWith("/") ||
    b.endsWith(".") ||
    b.endsWith(".lock");
  return bad ? "That isn’t a branch name. Letters, digits and . _ - / only, like feature/login." : null;
}

/** What a field says is wrong with it, by the form's field name. */
export type FormErrors = Partial<Record<"repo" | "pullNumber" | "branch" | "instructions" | "postOnPullRequest", string>>;

export type BriefResult = { ok: true; body: CrewJobInput } | { ok: false; errors: FormErrors };

/** Whether the report can go on a pull request with these choices, and what that means. */
export function pullRequestReport(form: Pick<JobForm, "member" | "target" | "finish">): { possible: boolean; label: string; hint: string } {
  if (form.member === "patch") {
    return {
      possible: form.target === "pull_request",
      label: "Post it on the pull request",
      hint: form.target === "pull_request" ? "As one review comment. Patch never approves or merges." : "Only when Patch reviews a pull request.",
    };
  }
  return {
    possible: form.finish === "pull_request",
    label: "Put it in the pull request Byte opens",
    hint: form.finish === "pull_request" ? "As the pull request’s description." : "Only when Byte opens a pull request.",
  };
}

/**
 * The brief to send for the form, or what is wrong with it. A pull request's link pasted as the repo
 * also fills in its number, when none was typed.
 */
export function briefFrom(form: JobForm, clientRequestId: string): BriefResult {
  const errors: FormErrors = {};
  const parsed = parseRepo(form.repo);
  if (!parsed.ok) errors.repo = parsed.error;

  const typedNumber = form.pullNumber.trim();
  const pullNumber = typedNumber ? pullNumberFrom(typedNumber) : pullNumberFrom(form.repo);
  if (form.target === "pull_request" && pullNumber === null)
    errors.pullNumber = typedNumber ? "That isn’t a pull request number. Type it like 42, or paste its link." : "Enter the pull request’s number.";
  if (form.target === "branch") {
    const problem = branchProblem(form.branch);
    if (problem) errors.branch = problem;
  }
  const instructions = form.instructions.trim();
  if (form.member === "byte" && !instructions) errors.instructions = "Tell Byte what to fix or build.";
  const toPullRequest = form.postOnPullRequest && pullRequestReport(form).possible;
  if (Object.keys(errors).length > 0 || !parsed.ok) return { ok: false, errors };

  const body: CrewJobInput = {
    member: form.member,
    owner: parsed.repo.owner,
    repo: parsed.repo.repo,
    pullNumber: form.target === "pull_request" ? pullNumber : null,
    branch: form.target === "branch" ? form.branch.trim() : null,
    instructions,
    commands: form.commands.trim(),
    // Byte's choice; Patch's is ignored by the server (the contract gives it a default).
    finish: form.member === "byte" ? form.finish : "pull_request",
    reportTo: { channel: form.channel, pullRequest: toPullRequest, issue: form.openIssue },
    clientRequestId,
  };
  if (form.member === "patch") body.focus = form.focus.length ? [...form.focus] : [...DEFAULT_FOCUS];
  else body.acceptance = form.acceptance.trim();
  return { ok: true, body };
}

// ---------------------------------------------------------------- a job, in words

export type JobState = { label: string; tone: "done" | "waiting" | "muted" | "danger" };

export const JOB_STATE: Record<CrewJob["status"], JobState> = {
  queued: { label: "Waiting", tone: "muted" },
  running: { label: "Working", tone: "waiting" },
  done: { label: "Done", tone: "done" },
  failed: { label: "Failed", tone: "danger" },
};

/** A status from a newer backend that this app doesn't know reads as waiting, not as a crash. */
export function jobState(status: string): JobState {
  return JOB_STATE[status as CrewJob["status"]] ?? JOB_STATE.queued;
}

export const isActive = (job: Pick<CrewJob, "status">) => job.status === "queued" || job.status === "running";

/** The member a job is for, or Patch for a value this app doesn't know. */
export const memberOf = (job: Pick<CrewJob, "member">): JobMember => (job.member === "byte" ? "byte" : "patch");

/** What the job looks at: "PR #42", "branch feature/x", "from main". */
export function jobTarget(job: Pick<CrewJob, "member" | "pullNumber" | "branch">): string {
  if (job.pullNumber) return `PR #${job.pullNumber}`;
  if (job.branch) return `${job.member === "byte" ? "from " : ""}branch ${job.branch}`;
  return job.member === "byte" ? "from the default branch" : "";
}

/** Where the report goes: "Report to web chat · on the pull request · in an issue". */
export function reportPlaces(job: Pick<CrewJob, "member" | "reportTo">): string {
  const reportTo = job.reportTo ?? { channel: "web", pullRequest: false, issue: false };
  const chat = reportTo.channel === "web" ? "web chat" : (CHANNEL_LABEL[reportTo.channel] ?? reportTo.channel);
  const places = [`Report to ${chat}`];
  if (reportTo.pullRequest) places.push(job.member === "byte" ? "in Byte’s pull request" : "on the pull request");
  if (reportTo.issue) places.push("in an issue");
  return places.join(" · ");
}

/** The job's title, made from its parts when an older answer has none. */
export function jobTitle(job: Partial<Pick<CrewJob, "title">> & Pick<CrewJob, "member" | "owner" | "repo" | "pullNumber" | "branch">): string {
  if (job.title) return job.title;
  const name = repoName({ owner: job.owner, repo: job.repo });
  return job.member === "patch" ? `Review ${name}${job.pullNumber ? `#${job.pullNumber}` : ""}` : `Change ${name}`;
}

// ---------------------------------------------------------------- refusals

export type JobError = { message: string; link?: { href: string; label: string }; field?: boolean };

/**
 * Why a job couldn't be given, for every answer the contract lists: 400 (the brief, shown above the
 * button), 402, 409 (GitHub isn't connected, or five jobs are waiting), 429, and 404 from a server
 * that doesn't have crew jobs yet. Anything else keeps the API's own message.
 */
export function describeCreateError(error: unknown, member: JobMember): JobError {
  if (!(error instanceof ApiError)) return { message: errorMessage(error) };
  const name = MEMBER_NAME[member];
  if (error.status === 400) return { message: error.message, field: true };
  if (error.outOfCredits) return { message: `You’re out of credits, so ${name} can’t start.`, link: { href: "/settings/credits", label: "Add credits" } };
  if (error.status === 409 && /github/i.test(error.message))
    return { message: `GitHub isn’t connected. ${name} needs it to clone the repo.`, link: { href: "/apps", label: "Open Apps" } };
  if (error.status === 409) return { message: error.message };
  if (error.status === 429) return { message: "That’s a lot of jobs in an hour. Wait a little and try again." };
  if (error.status === 404) return { message: "Crew jobs aren’t on this server yet." };
  return { message: error.message };
}

/** True when the server answered that it has no crew jobs at all (a backend from before them). */
export function notOnServer(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
