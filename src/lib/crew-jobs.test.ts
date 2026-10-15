import { describe, expect, it } from "vitest";
import { ApiError, type CrewJob } from "./api/client";
import {
  branchProblem,
  briefFrom,
  describeCreateError,
  emptyForm,
  isActive,
  jobState,
  jobTarget,
  jobTitle,
  notOnServer,
  pullNumberFrom,
  pullRequestReport,
  reportPlaces,
  type JobForm,
} from "./crew-jobs";

const ID = "6f1c2c1e-1111-4222-8333-944445555666";
const form = (over: Partial<JobForm> = {}): JobForm => ({ ...emptyForm("patch"), repo: "acme/web", pullNumber: "42", ...over });

describe("reading what was typed", () => {
  it("finds a pull request number typed or in a link", () => {
    expect(pullNumberFrom("42")).toBe(42);
    expect(pullNumberFrom(" #7 ")).toBe(7);
    expect(pullNumberFrom("https://github.com/acme/web/pull/42")).toBe(42);
    expect(pullNumberFrom("https://github.com/acme/web/pull/42/files")).toBe(42);
    for (const bad of ["", "0", "x", "4.2", "pull/", "https://github.com/acme/web/issues/42", "1234567890"]) expect(pullNumberFrom(bad), bad).toBeNull();
  });

  it("checks a branch name the way the server does", () => {
    for (const ok of ["main", "feature/login-2.0", "release_1"]) expect(branchProblem(ok), ok).toBeNull();
    for (const bad of ["", "a b", "-x", "a..b", "x.lock", "/x", "x/", "x.", "a//b", "feat`id`", "main;rm"]) expect(branchProblem(bad), bad).not.toBeNull();
  });
});

describe("the brief the form sends", () => {
  it("Patch on a pull request: the focus, and the report on the pull request when chosen", () => {
    const result = briefFrom(form({ focus: ["security"], commands: " pnpm test ", postOnPullRequest: true, openIssue: true }), ID);
    expect(result).toEqual({
      ok: true,
      body: {
        member: "patch",
        owner: "acme",
        repo: "web",
        pullNumber: 42,
        branch: null,
        instructions: "",
        commands: "pnpm test",
        finish: "pull_request",
        focus: ["security"],
        reportTo: { channel: "web", pullRequest: true, issue: true },
        clientRequestId: ID,
      },
    });
  });

  it("a pull request's link pasted as the repo fills in its number", () => {
    const result = briefFrom(form({ repo: "https://github.com/acme/web/pull/77", pullNumber: "" }), ID);
    expect(result.ok && result.body).toMatchObject({ owner: "acme", repo: "web", pullNumber: 77 });
  });

  it("Patch on a branch can't post on a pull request, and no focus means the usual three", () => {
    const result = briefFrom(form({ target: "branch", branch: "feature/x", focus: [], postOnPullRequest: true }), ID);
    expect(result.ok && result.body).toMatchObject({ pullNumber: null, branch: "feature/x", focus: ["bugs", "security", "tests"], reportTo: { pullRequest: false } });
    expect(pullRequestReport({ member: "patch", target: "branch", finish: "pull_request" }).possible).toBe(false);
  });

  it("Byte: what to fix, what to test for and how it ends", () => {
    const base = { ...emptyForm("byte", "telegram"), repo: "acme/web" };
    expect(briefFrom(base, ID)).toEqual({ ok: false, errors: { instructions: "Tell Byte what to fix or build." } });
    const result = briefFrom({ ...base, instructions: " Fix the redirect ", acceptance: "lands on /home", target: "branch", branch: "develop", finish: "branch", postOnPullRequest: true }, ID);
    expect(result.ok && result.body).toMatchObject({
      member: "byte",
      branch: "develop",
      pullNumber: null,
      instructions: "Fix the redirect",
      acceptance: "lands on /home",
      finish: "branch",
      reportTo: { channel: "telegram", pullRequest: false, issue: false },
    });
    expect(result.ok && "focus" in result.body).toBe(false);
    expect(pullRequestReport({ member: "byte", target: "default", finish: "pull_request" })).toMatchObject({ possible: true, label: "Put it in the pull request Byte opens" });
  });

  it("says what is wrong, field by field", () => {
    expect(briefFrom(form({ repo: "", pullNumber: "" }), ID)).toEqual({
      ok: false,
      errors: { repo: "Enter a repo as owner/repo, or paste its GitHub link.", pullNumber: "Enter the pull request’s number." },
    });
    expect(briefFrom(form({ pullNumber: "abc" }), ID)).toMatchObject({ ok: false, errors: { pullNumber: expect.stringMatching(/isn’t a pull request number/) } });
    expect(briefFrom(form({ target: "branch", branch: "a b" }), ID)).toMatchObject({ ok: false, errors: { branch: expect.any(String) } });
    expect(briefFrom(form({ repo: "https://gitlab.com/acme/web" }), ID)).toMatchObject({ ok: false, errors: { repo: "Only repos on github.com can be reviewed." } });
  });
});

const job = (over: Partial<CrewJob> = {}): CrewJob => ({
  id: "crj_1",
  member: "patch",
  status: "done",
  title: "Review acme/web#42",
  owner: "acme",
  repo: "web",
  pullNumber: 42,
  branch: null,
  instructions: "",
  focus: ["bugs"],
  acceptance: "",
  commands: "",
  finish: null,
  reportTo: { channel: "web", pullRequest: true, issue: false },
  source: "app",
  report: "**Verdict:** ship",
  error: null,
  conversationId: null,
  createdAt: "2026-10-13T09:00:00Z",
  startedAt: "2026-10-13T09:00:05Z",
  finishedAt: "2026-10-13T09:04:00Z",
  ...over,
});

describe("a job, in words", () => {
  it("its state, what it looks at and where the report goes", () => {
    expect(jobState("running")).toEqual({ label: "Working", tone: "waiting" });
    expect(jobState("failed").tone).toBe("danger");
    expect(jobState("archived")).toEqual(jobState("queued"));
    expect(isActive(job({ status: "queued" }))).toBe(true);
    expect(isActive(job())).toBe(false);
    expect(jobTarget(job())).toBe("PR #42");
    expect(jobTarget(job({ member: "byte", pullNumber: null, branch: "develop" }))).toBe("from branch develop");
    expect(jobTarget(job({ member: "byte", pullNumber: null }))).toBe("from the default branch");
    expect(reportPlaces(job())).toBe("Report to web chat · on the pull request");
    expect(reportPlaces(job({ member: "byte", reportTo: { channel: "telegram", pullRequest: true, issue: true } }))).toBe(
      "Report to Telegram · in Byte’s pull request · in an issue",
    );
    expect(jobTitle(job())).toBe("Review acme/web#42");
    expect(jobTitle({ ...job({ member: "byte" }), title: undefined })).toBe("Change acme/web");
  });
});

describe("refusals", () => {
  it("puts each answer the contract lists into words", () => {
    expect(describeCreateError(new ApiError(400, "invalid_request", "Give Patch a pull request or a branch to review"), "patch")).toEqual({
      message: "Give Patch a pull request or a branch to review",
      field: true,
    });
    expect(describeCreateError(new ApiError(402, "out_of_credits", "x"), "byte")).toMatchObject({ message: "You’re out of credits, so Byte can’t start.", link: { href: "/settings/credits" } });
    expect(describeCreateError(new ApiError(409, "conflict", "Connect GitHub first"), "patch")).toMatchObject({ link: { href: "/integrations/apps" } });
    expect(describeCreateError(new ApiError(409, "conflict", "5 crew jobs are already waiting."), "patch")).toEqual({ message: "5 crew jobs are already waiting." });
    expect(describeCreateError(new ApiError(429, "rate_limited", "x"), "patch").message).toMatch(/a lot of jobs/);
    expect(describeCreateError(new ApiError(404, "not_found", "x"), "patch").message).toMatch(/aren’t on this server/);
    expect(describeCreateError(new Error("offline"), "patch")).toEqual({ message: "offline" });
    expect(notOnServer(new ApiError(404, "not_found", "x"))).toBe(true);
    expect(notOnServer(new ApiError(500, "internal", "x"))).toBe(false);
  });
});
