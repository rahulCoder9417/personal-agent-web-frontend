import { describe, expect, it } from "vitest";
import { ApiError } from "./api/client";
import { describeDisableError, describeEnableError, describeReviewState, parseRepo, repoName, sameRepo, verdictPlace } from "./pr-review";

const ok = (owner: string, repo: string) => ({ ok: true, repo: { owner, repo } });

describe("parseRepo", () => {
  it("reads owner/repo however it is typed", () => {
    expect(parseRepo("acme/website")).toEqual(ok("acme", "website"));
    expect(parseRepo("  acme/website  ")).toEqual(ok("acme", "website"));
    expect(parseRepo("acme / website")).toEqual(ok("acme", "website"));
    expect(parseRepo("acme/website/")).toEqual(ok("acme", "website"));
    expect(parseRepo("acme/website.git")).toEqual(ok("acme", "website"));
    expect(parseRepo("Acme-Inc/web_site.v2")).toEqual(ok("Acme-Inc", "web_site.v2"));
    expect(parseRepo("acme/.github")).toEqual(ok("acme", ".github"));
  });

  it("reads a GitHub link, also one that points inside the repo", () => {
    expect(parseRepo("https://github.com/acme/website")).toEqual(ok("acme", "website"));
    expect(parseRepo("https://github.com/acme/website/")).toEqual(ok("acme", "website"));
    expect(parseRepo("https://github.com/acme/website/pull/128")).toEqual(ok("acme", "website"));
    expect(parseRepo("https://github.com/acme/website/tree/main/src?tab=readme#top")).toEqual(ok("acme", "website"));
    expect(parseRepo("http://www.github.com/acme/website.git")).toEqual(ok("acme", "website"));
    expect(parseRepo("github.com/acme/website")).toEqual(ok("acme", "website"));
    expect(parseRepo("www.github.com/acme/website/pulls")).toEqual(ok("acme", "website"));
  });

  it("reads a clone address", () => {
    expect(parseRepo("git@github.com:acme/website.git")).toEqual(ok("acme", "website"));
    expect(parseRepo("ssh://git@github.com/acme/website.git")).toEqual(ok("acme", "website"));
  });

  it("says what is missing", () => {
    expect(parseRepo("")).toEqual({ ok: false, error: "Enter a repo as owner/repo, or paste its GitHub link." });
    expect(parseRepo("   ")).toMatchObject({ ok: false });
    expect(parseRepo("acme")).toEqual({ ok: false, error: "Add the repo’s name too: acme/repo." });
    expect(parseRepo("https://github.com/acme")).toEqual({ ok: false, error: "Add the repo’s name too: acme/repo." });
  });

  it("refuses other sites and things that are not a repo", () => {
    expect(parseRepo("https://gitlab.com/acme/website")).toEqual({ ok: false, error: "Only repos on github.com can be reviewed." });
    expect(parseRepo("git@bitbucket.org:acme/website.git")).toMatchObject({ ok: false, error: "Only repos on github.com can be reviewed." });
    expect(parseRepo("github.com.evil.example/acme/website")).toMatchObject({ ok: false, error: "Only repos on github.com can be reviewed." });
    for (const bad of ["acme/website/extra", "acme/web site", "acme/we$bsite", "acme/..", "../website", "acme/.git", "https://", `acme/${"x".repeat(101)}`]) {
      expect(parseRepo(bad), bad).toMatchObject({ ok: false });
    }
  });
});

describe("repoName and sameRepo", () => {
  it("writes a repo as owner/repo and ignores case when comparing", () => {
    expect(repoName({ owner: "acme", repo: "website" })).toBe("acme/website");
    expect(sameRepo({ owner: "Acme", repo: "Website" }, { owner: "acme", repo: "website" })).toBe(true);
    expect(sameRepo({ owner: "acme", repo: "website" }, { owner: "acme", repo: "api" })).toBe(false);
  });
});

describe("describeReviewState", () => {
  it("says on, or paused and why, with the way out", () => {
    expect(describeReviewState({ enabled: true, pausedReason: null })).toEqual({ label: "On", tone: "done", why: null });
    expect(describeReviewState({ enabled: false, pausedReason: "user" })).toEqual({ label: "Paused", tone: "muted", why: "Paused by you." });
    expect(describeReviewState({ enabled: false, pausedReason: "out_of_credits" })).toMatchObject({
      label: "Paused",
      tone: "danger",
      why: "Paused because you ran out of credits.",
      fix: { href: "/settings/credits" },
    });
    expect(describeReviewState({ enabled: false, pausedReason: "failures" })).toMatchObject({ tone: "danger", fix: { href: "/apps" } });
    expect(describeReviewState({ enabled: false, pausedReason: null })).toEqual({ label: "Paused", tone: "muted", why: "Paused." });
  });
});

describe("verdictPlace", () => {
  it("names the chat the verdict goes to", () => {
    expect(verdictPlace("telegram")).toBe("the Automations chat, with a copy on Telegram");
    expect(verdictPlace("web")).toBe("the Automations chat");
  });
});

describe("describeEnableError", () => {
  const error = (status: number, code: string, message = "From the API") => new ApiError(status, code, message);

  it("explains the plan limit with the plan's own numbers, and where to go", () => {
    expect(describeEnableError(error(403, "plan_limit"), "acme/website", { planName: "Pro", automations: 5, canUpgrade: true })).toEqual({
      message: "Your Pro plan allows 5 automations, and each repo with review on counts as one. Turn one off, or upgrade.",
      link: { href: "/settings/plans", label: "See plans" },
    });
    expect(describeEnableError(error(403, "plan_limit"), "acme/website", { planName: "Free", automations: 1, canUpgrade: true }).message).toContain(
      "allows 1 automation,",
    );
    // On the top plan there is nothing to upgrade to.
    expect(describeEnableError(error(403, "plan_limit"), "acme/website", { planName: "Max", automations: 50, canUpgrade: false })).toEqual({
      message: "Your Max plan allows 50 automations, and each repo with review on counts as one. Turn one off to add this repo.",
      link: { href: "/automations", label: "See your automations" },
    });
    // The plan hasn't loaded: still say what happened.
    expect(describeEnableError(error(403, "plan_limit"), "acme/website").message).toContain("Your plan’s automations are used up");
  });

  it("sends someone without GitHub to the Apps screen", () => {
    expect(describeEnableError(error(409, "conflict"), "acme/website")).toEqual({
      message: "GitHub isn’t connected. Connect it in Apps, then turn review on.",
      link: { href: "/apps", label: "Open Apps" },
    });
  });

  it("names the repo GitHub wouldn't let us watch, and what to check", () => {
    const refused = describeEnableError(error(400, "invalid_request"), "acme/website");
    expect(refused.message).toBe("Couldn’t start watching acme/website. Check that the repo exists and that the GitHub account you connected has admin access to it.");
    expect(refused.link).toEqual({ href: "/apps", label: "Check GitHub in Apps" });
  });

  it("asks for patience when there were too many tries", () => {
    expect(describeEnableError(error(429, "rate_limited"), "acme/website")).toEqual({ message: "Too many tries. Wait a little and try again." });
  });

  it("keeps the API's words for anything else", () => {
    expect(describeEnableError(error(401, "unauthorized", "Sign in to continue"), "acme/website")).toEqual({ message: "Sign in to continue" });
    expect(describeEnableError(error(0, "network", "You seem to be offline."), "acme/website").message).toBe("You seem to be offline.");
    expect(describeEnableError(new Error("boom"), "acme/website").message).toBe("boom");
  });
});

describe("describeDisableError", () => {
  it("doesn't complain about a repo that was already off", () => {
    expect(describeDisableError(new ApiError(404, "not_found", "Pull-request review is not on for this repo"))).toBeNull();
    expect(describeDisableError(new ApiError(400, "invalid_request", "Not a GitHub repository name"))).toBe("Not a GitHub repository name");
  });
});
