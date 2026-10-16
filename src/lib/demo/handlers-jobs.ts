// Crew jobs for the demo account: the GitHub repos to pick from, and a brief for Patch or Byte that
// runs a little later the way the backend runs it: waiting, working (with the member's progress
// lines), then done with a report in the report's shape, sent to the chat the brief chose.

import type { Conversation, CrewJob, CrewJobFocus } from "@/lib/api/client";
import { branchProblem } from "@/lib/crew-jobs";
import { nowIso, truncate, upperFirst, type Handler } from "./context";
import { postFromTex } from "./handlers-chat";
import { activeConversation, findConversation } from "./handlers-conversations";
import { badRequest, conflict, isRecord, json, notFound, outOfCredits, paginate, rateLimited, readJson, type JsonObject } from "./http";
import type { DemoCrewJob } from "./seed";
import { balanceOf, chargeAppAction, chargeUsage, emit, logActivity, nextId, schedule, setAgentState, type DemoState } from "./store";

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOCUS: readonly CrewJobFocus[] = ["bugs", "security", "tests", "performance", "style"];
const DEFAULT_FOCUS: CrewJobFocus[] = ["bugs", "security", "tests"];
const MAX_PENDING = 5;
const PER_HOUR = 20;
const HOUR_MS = 3_600_000;
/** How long each part of a job takes in the demo: picked up, each progress line, the report. */
const PICKUP_MS = 900;
const STEP_MS = 1400;

const githubConnected = (state: DemoState) =>
  state.apps.find((app) => app.slug === "github")?.connections.some((connection) => connection.status === "active") ?? false;

/** A job as the API returns it (the request id that made it stays in the demo). */
function toApi(job: DemoCrewJob): CrewJob {
  const copy: Partial<DemoCrewJob> = structuredClone(job);
  delete copy.clientRequestId;
  return copy as CrewJob;
}

// ---------------------------------------------------------------- the repos

export const listGithubRepos: Handler = ({ state }) => {
  if (!githubConnected(state)) throw conflict("Connect GitHub first");
  return json({ items: state.githubRepos });
};

// ---------------------------------------------------------------- the jobs

export const listCrewJobs: Handler = ({ state, url }) => json(paginate(state.crewJobs.map(toApi), url));

export const getCrewJob: Handler = ({ state, params }) => {
  const job = state.crewJobs.find((item) => item.id === params.crewJobId);
  if (!job) throw notFound("Crew job not found");
  return json(toApi(job));
};

function text(body: JsonObject, name: string, max: number): string {
  const value = body[name];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw badRequest(`${name} must be a string`);
  if (value.length > max) throw badRequest(`${name} is too long`);
  return value.trim();
}

function plainName(value: unknown, what: string): string {
  const name = typeof value === "string" && value.endsWith(".git") ? value.slice(0, -4) : value;
  if (typeof name !== "string" || !NAME.test(name) || name === "." || name === "..") throw badRequest(`${what} is not a GitHub name`);
  return name;
}

function title(job: Pick<CrewJob, "member" | "owner" | "repo" | "pullNumber" | "branch" | "instructions">): string {
  const name = `${job.owner}/${job.repo}`;
  if (job.member === "patch") return job.pullNumber ? `Review ${name}#${job.pullNumber}` : `Review ${name} at ${job.branch}`;
  return `${upperFirst(truncate(job.instructions, 60).replace(/[\s.,;:!?]+$/, ""))} in ${name}`;
}

/** The brief, checked in the backend's order: 400 for what doesn't hold together. */
function readBrief(state: DemoState, body: JsonObject) {
  const member = body.member;
  if (member !== "patch" && member !== "byte") throw badRequest("Pick Patch or Byte");
  const owner = plainName(body.owner, "The owner");
  const repo = plainName(body.repo, "The repository");
  const rawNumber = body.pullNumber;
  if (rawNumber !== undefined && rawNumber !== null && (typeof rawNumber !== "number" || !Number.isInteger(rawNumber) || rawNumber < 1))
    throw badRequest("The pull request number must be a whole number");
  const pullNumber = typeof rawNumber === "number" ? rawNumber : null;
  const rawBranch = typeof body.branch === "string" ? body.branch.trim() : "";
  if (rawBranch && branchProblem(rawBranch)) throw badRequest("That is not a branch name (letters, digits and . _ - / only)");
  const branch = rawBranch || null;
  const instructions = text(body, "instructions", 4000);
  const commands = text(body, "commands", 2000);
  const reportTo = isRecord(body.reportTo) ? body.reportTo : {};
  const channel = reportTo.channel === "telegram" ? "telegram" : "web";
  if (channel === "telegram" && !state.channels.some((link) => link.channel === "telegram"))
    throw badRequest("Link Telegram first, or send the report to web chat");
  const pullRequest = reportTo.pullRequest === true;
  const issue = reportTo.issue === true;

  if (member === "patch") {
    if (pullNumber === null && branch === null) throw badRequest("Give Patch a pull request or a branch to review");
    if (pullRequest && pullNumber === null) throw badRequest("Posting the report on the pull request needs its number");
    const given = Array.isArray(body.focus) ? body.focus : [];
    for (const f of given) if (!FOCUS.includes(f as CrewJobFocus)) throw badRequest(`Unknown focus "${String(f)}"`);
    const focus = [...new Set(given as CrewJobFocus[])];
    return {
      member, owner, repo, pullNumber, branch, instructions, commands, acceptance: "",
      focus: focus.length ? focus : [...DEFAULT_FOCUS], finish: null, reportTo: { channel, pullRequest, issue },
    } as const;
  }
  if (!instructions) throw badRequest("Tell Byte what to fix or build");
  const finish = body.finish === "branch" ? "branch" : "pull_request";
  if (pullRequest && finish !== "pull_request") throw badRequest('Byte puts the report in the pull request it opens: choose "open a pull request"');
  return {
    member, owner, repo, pullNumber, branch, instructions, commands, acceptance: text(body, "acceptance", 2000),
    focus: [] as CrewJobFocus[], finish, reportTo: { channel, pullRequest, issue },
  } as const;
}

/**
 * Gives Patch a review or Byte a job, in the backend's order: the same request id again is the same
 * job (200), then 429, 400, 402, 409 (no GitHub, or five jobs waiting), and 201.
 */
export const createCrewJob: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const clientRequestId = body.clientRequestId;
  if (typeof clientRequestId !== "string" || !UUID.test(clientRequestId)) throw badRequest("clientRequestId must be a UUID");
  const seen = state.crewJobs.find((job) => job.clientRequestId === clientRequestId);
  if (seen) return json(toApi(seen));

  const now = Date.now();
  state.crewJobCalls = state.crewJobCalls.filter((at) => now - at < HOUR_MS);
  if (state.crewJobCalls.length >= PER_HOUR) throw rateLimited();
  state.crewJobCalls.push(now);

  const brief = readBrief(state, body);
  if (balanceOf(state) <= 0) throw outOfCredits();
  if (!githubConnected(state)) throw conflict("Connect GitHub first");
  if (state.crewJobs.filter((job) => job.status === "queued" || job.status === "running").length >= MAX_PENDING)
    throw conflict(`${MAX_PENDING} crew jobs are already waiting. Give one a moment to finish.`);

  const job: DemoCrewJob = {
    id: nextId(state, "crj"),
    ...brief,
    focus: [...brief.focus],
    reportTo: { ...brief.reportTo },
    status: "queued",
    title: title(brief),
    source: "app",
    report: null,
    error: null,
    conversationId: null,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    clientRequestId,
  };
  state.crewJobs.unshift(job);
  logActivity(state, { actor: "user", action: "crew_job_created", summary: `${job.member === "patch" ? "Patch" : "Byte"}: ${job.title}`, crew: job.member });
  run(state, job);
  return json(toApi(job), 201);
};

// ---------------------------------------------------------------- running one

const STEPS: Record<CrewJob["member"], string[]> = {
  patch: ["cloning the repo into the job folder", "running the tests in the background", "reading the diff", "stopped 1 program and deleted the job folder"],
  byte: ["cloning the repo into the job folder", "writing the change", "running the acceptance checks", "pushing the branch", "stopped 2 programs and deleted the job folder"],
};

/** The demo's report, in the report's shape. Nothing is really reviewed or changed in the demo. */
export function demoReport(job: DemoCrewJob): string {
  const tests = job.commands ? `- \`${job.commands.split("\n")[0]}\`: passed (48 passed, 0 failed)` : "- `pnpm test`: passed (48 passed, 0 failed), found in package.json";
  if (job.member === "patch") {
    return [
      "**Verdict:** fix first",
      "",
      "**Findings**",
      "1. [medium] `src/lib/session.ts:57`: the session is read before it is checked, so an expired one is used once.",
      "2. [low] `src/lib/session.test.ts`: no test for an expired session.",
      "",
      "**Tests run**",
      tests,
      "",
      "**Not checked**",
      "- Nothing is really reviewed in the demo account: this report is made up.",
    ].join("\n");
  }
  const branch = `crew/${job.id.slice(-8)}`;
  const pr = job.finish === "pull_request" ? `[${job.owner}/${job.repo}#212](https://github.example/${job.owner}/${job.repo}/pull/212)` : "none (only the branch was asked for)";
  return [
    "**Verdict:** done",
    `**Branch:** \`${branch}\` (pushed) · **Pull request:** ${pr}`,
    "",
    "**Changes**",
    "1. `src/app/signup/form.tsx:88`: the email stays in the field after a wrong password.",
    "",
    "**Acceptance checks**",
    job.acceptance ? `- ${truncate(job.acceptance, 120)}: passed` : "- No checks were given.",
    "",
    "**Tests run**",
    tests,
    "",
    "**Not checked**",
    "- Nothing is really changed in the demo account: this report is made up.",
  ].join("\n");
}

/** Where the report goes: a web conversation of the job's own, or the linked Telegram chat's current one. */
function reportConversation(state: DemoState, job: DemoCrewJob): Conversation | undefined {
  if (job.reportTo.channel !== "web") return activeConversation(state, job.reportTo.channel);
  const epochs = state.conversations.filter((conversation) => conversation.channel === "web").map((conversation) => conversation.epoch);
  const at = nowIso();
  const own: Conversation = {
    id: nextId(state, "cnv"),
    channel: "web",
    kind: "chat",
    epoch: epochs.length ? Math.max(...epochs) + 1 : 0,
    startedAt: at,
    lastMessageAt: at,
    title: job.title,
    active: false,
    unread: false,
  };
  state.conversations.push(own);
  emit(state, "conversation.updated", own);
  return own;
}

function progress(state: DemoState, job: DemoCrewJob, step: string): void {
  const name = job.member === "patch" ? "Patch" : "Byte";
  const line = `${name}: ${step}`;
  emit(state, "agent.progress", { text: line, crew: job.member, at: nowIso() });
  logActivity(state, { actor: "agent", action: "crew_progress", summary: line, crew: job.member });
}

/** Waiting → working (its progress lines) → done, with the report in the chat it chose. */
function run(state: DemoState, job: DemoCrewJob): void {
  schedule(state, PICKUP_MS, () => {
    job.status = "running";
    job.startedAt = nowIso();
    setAgentState(state, "busy");
    STEPS[job.member].forEach((step, index) => schedule(state, STEP_MS * (index + 1), () => progress(state, job, step)));
    schedule(state, STEP_MS * (STEPS[job.member].length + 1), () => {
      const conversation = reportConversation(state, job);
      job.report = demoReport(job);
      job.conversationId = conversation?.channel === "web" ? conversation.id : null;
      if (conversation && findConversation(state, conversation.id)) postFromTex(state, conversation.id, job.report);
      // The time the agent ran, and 1 credit for each app action that changed something.
      chargeUsage(state, { awake: 1 });
      if (job.reportTo.pullRequest) chargeAppAction(state, job.member === "patch" ? "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST" : "GITHUB_CREATE_A_PULL_REQUEST");
      else if (job.member === "byte" && job.finish === "pull_request") chargeAppAction(state, "GITHUB_CREATE_A_PULL_REQUEST");
      if (job.reportTo.issue) chargeAppAction(state, "GITHUB_CREATE_AN_ISSUE");
      job.status = "done";
      job.finishedAt = nowIso();
      logActivity(state, { actor: "system", action: "crew_job_done", summary: `Done: ${job.title}`, crew: job.member });
      // The job's work is over: the container goes to sleep at once.
      setAgentState(state, "stopped");
    });
  });
}
