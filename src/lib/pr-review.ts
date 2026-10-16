// Pull-request review, per GitHub repo (`/v1/pr-reviews`): reading what someone typed as a repo,
// and putting a repo's state and the API's refusals into words. No React here, so it can be tested.

import { ApiError, errorMessage, type ChannelType, type PrReviewRepo } from "./api/client";
import { CHANNEL_LABEL } from "./format";
import { INTEGRATIONS_APPS_PATH } from "./integrations";
import { PRICING_PATH } from "./pricing";

export type RepoRef = { owner: string; repo: string };

export const repoName = (ref: RepoRef) => `${ref.owner}/${ref.repo}`;

// ---------------------------------------------------------------- what was typed

export type ParsedRepo = { ok: true; repo: RepoRef } | { ok: false; error: string };

/** The contract's pattern for an owner and for a repo name. */
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const GITHUB_HOST = /^(www\.)?github\.com$/i;
/** `git@github.com:acme/website.git`, with or without `ssh://` in front. */
const SSH = /^(?:ssh:\/\/)?git@([^:/\s]+)[:/](.+)$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** `github.com/acme/website`: a first part with a dot in it is a site, since a GitHub owner can't have one. */
const STARTS_WITH_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i;

const FORMAT = "That doesn’t look like a GitHub repo. Write it as owner/repo, like acme/website, or paste its GitHub link.";

const fail = (error: string): ParsedRepo => ({ ok: false, error });
const valid = (name: string) => NAME.test(name) && name !== "." && name !== "..";

/**
 * Reads a repo from `owner/repo`, a GitHub link (also one to a pull request or a branch inside the
 * repo) or a clone address. Anything after the repo's name is ignored, and so is a trailing `.git`.
 */
export function parseRepo(input: string): ParsedRepo {
  // "acme / website" is what some people type.
  const text = input.trim().replace(/\s*\/\s*/g, "/");
  if (!text) return fail("Enter a repo as owner/repo, or paste its GitHub link.");

  let host: string | null = null;
  let path = text;
  const ssh = SSH.exec(text);
  if (ssh) {
    host = ssh[1];
    path = ssh[2];
  } else if (HAS_SCHEME.test(text) || STARTS_WITH_HOST.test(text)) {
    try {
      const url = new URL(HAS_SCHEME.test(text) ? text : `https://${text}`);
      host = url.hostname;
      path = url.pathname;
    } catch {
      return fail(FORMAT);
    }
  }
  if (host !== null && !GITHUB_HOST.test(host)) return fail("Only repos on github.com can be reviewed.");

  const parts = path.split(/[?#]/)[0].split("/").filter(Boolean);
  if (parts.length < 2) return fail(parts.length === 1 && valid(parts[0]) ? `Add the repo’s name too: ${parts[0]}/repo.` : FORMAT);
  // Typed by hand it is exactly owner/repo; a link may go deeper (/pull/12, /tree/main).
  if (host === null && parts.length > 2) return fail(FORMAT);

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!valid(owner) || !valid(repo)) return fail(FORMAT);
  return { ok: true, repo: { owner, repo } };
}

/** GitHub ignores case in an owner and a repo name, and so does the backend. */
export function sameRepo(a: RepoRef, b: RepoRef): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
}

// ---------------------------------------------------------------- a repo's state

export type FixLink = { href: string; label: string };

export type ReviewState = {
  label: "On" | "Paused";
  tone: "done" | "muted" | "danger";
  /** Why it is paused, when it is. */
  why: string | null;
  /** Where to go to get it running again, when that isn't the switch itself. */
  fix?: FixLink;
};

/** On, or paused and why, with the way out. */
export function describeReviewState(review: Pick<PrReviewRepo, "enabled" | "pausedReason">): ReviewState {
  if (review.enabled) return { label: "On", tone: "done", why: null };
  if (review.pausedReason === "out_of_credits") {
    return { label: "Paused", tone: "danger", why: "Paused because you ran out of credits.", fix: { href: "/settings/credits", label: "Add credits" } };
  }
  if (review.pausedReason === "failures") {
    return { label: "Paused", tone: "danger", why: "Paused after a few reviews in a row failed.", fix: { href: INTEGRATIONS_APPS_PATH, label: "Check GitHub in Integrations" } };
  }
  return { label: "Paused", tone: "muted", why: review.pausedReason === "user" ? "Paused by you." : "Paused." };
}

/**
 * Where the short verdict is sent. Always the Automations chat; with a linked chat app (Telegram),
 * a copy goes there too.
 */
export function verdictPlace(channel: ChannelType): string {
  return channel === "web" ? "the Automations chat" : `the Automations chat, with a copy on ${CHANNEL_LABEL[channel]}`;
}

// ---------------------------------------------------------------- refusals

export type ReviewError = { message: string; link?: FixLink };

/** What the screen knows about the plan, to say how many automations it allows. */
export type PlanContext = { planName?: string; automations?: number; canUpgrade?: boolean };

/**
 * Why review couldn't be turned on for `repo`, for every answer the contract lists:
 * 400 (not a repo, or GitHub wouldn't let us watch it), 403 `plan_limit`, 409 (GitHub isn't
 * connected) and 429. Anything else keeps the API's own message.
 */
export function describeEnableError(error: unknown, repo: string, plan: PlanContext = {}): ReviewError {
  if (!(error instanceof ApiError)) return { message: errorMessage(error) };

  if (error.planLimit || error.status === 403) {
    const allows =
      plan.planName && plan.automations !== undefined
        ? `Your ${plan.planName} plan allows ${plan.automations} ${plan.automations === 1 ? "automation" : "automations"}`
        : "Your plan’s automations are used up";
    return plan.canUpgrade === false
      ? { message: `${allows}, and each repo with review on counts as one. Turn one off to add this repo.`, link: { href: "/automations", label: "See your automations" } }
      : { message: `${allows}, and each repo with review on counts as one. Turn one off, or upgrade.`, link: { href: PRICING_PATH, label: "See plans" } };
  }
  if (error.status === 409) {
    return { message: "GitHub isn’t connected. Connect it in Integrations, then turn review on.", link: { href: INTEGRATIONS_APPS_PATH, label: "Open Integrations" } };
  }
  if (error.status === 400) {
    return {
      message: `Couldn’t start watching ${repo}. Check that the repo exists and that the GitHub account you connected has admin access to it.`,
      link: { href: INTEGRATIONS_APPS_PATH, label: "Check GitHub in Integrations" },
    };
  }
  if (error.status === 429) return { message: "Too many tries. Wait a little and try again." };
  return { message: error.message };
}

/** Why review couldn't be turned off. A repo that was already off is not worth an error. */
export function describeDisableError(error: unknown): string | null {
  if (error instanceof ApiError && error.status === 404) return null;
  return errorMessage(error);
}
