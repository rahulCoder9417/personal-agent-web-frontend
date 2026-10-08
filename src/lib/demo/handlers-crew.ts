// The crew list and pull-request review for the demo account.

import type { ChannelType, CrewMember, PrReviewRepo } from "@/lib/api/client";
import { nowIso, type Handler } from "./context";
import { badRequest, conflict, json, noContent, notFound, planLimit, rateLimited } from "./http";
import { reviewAutomation, type DemoPrReview } from "./seed";
import { emit, logActivity, nextId, type DemoState } from "./store";

// ---------------------------------------------------------------- the crew

// The crew as the backend lists it: fixed ids, names, roles and descriptions.
const CREW: Omit<CrewMember, "available" | "browser">[] = [
  { id: "tex", name: "Tex", kind: "lead", role: "Lead", description: "The one you text. Plans the job, hands parts to the crew and answers you." },
  { id: "byte", name: "Byte", kind: "specialist", role: "Coding", description: "Writes and changes code, and opens pull requests." },
  { id: "patch", name: "Patch", kind: "specialist", role: "Code review", description: "Reviews code with several reviewers: bugs, security and tests." },
  { id: "scout", name: "Scout", kind: "specialist", role: "Research", description: "Searches the web and reads pages. On Max it also drives a real browser." },
];

/** Scout's real browser isn't built yet. The plan it needs comes from the plans, as in the backend. */
const BROWSER_BUILT = false;

export const listCrew: Handler = ({ state }) => {
  const browserPlan = state.plans.find((plan) => plan.limits.browser)?.id ?? "max";
  const items: CrewMember[] = CREW.map((member) => ({
    ...member,
    available: member.kind === "lead" || state.crewAvailable.some((id) => id === member.id),
    browser: member.id === "scout" ? { requiresPlan: browserPlan, available: BROWSER_BUILT, enabled: BROWSER_BUILT && state.user.plan === browserPlan } : null,
  }));
  return json({ items });
};

// ---------------------------------------------------------------- pull-request review

const REPO_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const CALLS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;
/**
 * Stands in for a repo the connected GitHub account can't administer: there is no GitHub to ask
 * in the demo, so review for anything owned by `octocat` is refused the way the backend refuses it.
 */
export const NO_ADMIN_OWNER = "octocat";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A GitHub owner and repo name (a trailing `.git` is dropped). 400 for anything else. */
function repoRef(params: Record<string, string>): { owner: string; repo: string } {
  const owner = params.owner;
  const repo = params.repo.endsWith(".git") ? params.repo.slice(0, -4) : params.repo;
  const ok = (value: string) => REPO_NAME.test(value) && value !== "." && value !== "..";
  if (!ok(owner) || !ok(repo)) throw badRequest("Not a GitHub repository name");
  return { owner, repo };
}

function findReview(state: DemoState, repo: { owner: string; repo: string }): DemoPrReview | undefined {
  return state.prReviews.find((review) => same(review.owner, repo.owner) && same(review.repo, repo.repo));
}

function toPrReview(state: DemoState, review: DemoPrReview): PrReviewRepo | null {
  const automation = state.automations.find((item) => item.id === review.automationId);
  if (!automation) return null;
  return {
    id: automation.id,
    owner: review.owner,
    repo: review.repo,
    enabled: automation.enabled,
    pausedReason: automation.pausedReason ?? null,
    channel: review.channel,
    lastReviewAt: automation.lastRunAt ?? null,
    createdAt: automation.createdAt,
  };
}

export const listPrReviews: Handler = ({ state }) =>
  json({ items: state.prReviews.map((review) => toPrReview(state, review)).filter((review) => review !== null) });

/** Where the verdict goes: the linked Telegram chat if there is one, otherwise web chat. */
function verdictChannel(state: DemoState): ChannelType {
  const linked = state.availableChannels.includes("telegram") && state.channels.some((link) => link.channel === "telegram");
  return linked ? "telegram" : "web";
}

/**
 * Turns review on for one repo, in the backend's order: a bad name is 400, too many calls 429,
 * a repo that is already on is returned (and resumed), no GitHub is 409, a full plan 403, and a
 * repo GitHub won't let us watch 400.
 */
export const enablePrReview: Handler = ({ state, params }) => {
  const repo = repoRef(params);
  const name = `${repo.owner}/${repo.repo}`;

  const now = Date.now();
  state.prReviewCalls = state.prReviewCalls.filter((at) => now - at < HOUR_MS);
  if (state.prReviewCalls.length >= CALLS_PER_HOUR) throw rateLimited();
  state.prReviewCalls.push(now);

  const existing = findReview(state, repo);
  const automation = existing && state.automations.find((item) => item.id === existing.automationId);
  if (existing && automation) {
    if (!automation.enabled) {
      automation.enabled = true;
      automation.pausedReason = null;
      emit(state, "automation.updated", automation);
    }
    return json(toPrReview(state, existing));
  }

  const github = state.apps.find((app) => app.slug === "github");
  if (!github?.connections.some((connection) => connection.status === "active")) throw conflict("Connect GitHub first");

  const limit = state.plans.find((plan) => plan.id === state.user.plan)?.limits.automations ?? 0;
  if (state.automations.length >= limit) {
    throw planLimit(`Your ${state.user.plan} plan allows ${limit} automations; cancel one or upgrade`);
  }
  if (same(repo.owner, NO_ADMIN_OWNER)) {
    throw badRequest(
      `Could not start watching ${name} for pull requests. Check that the repository exists and that your connected GitHub account has admin access to it, then try again.`,
    );
  }

  const created = reviewAutomation(nextId(state, "aut"), name, state.user.timezone, nowIso());
  const review: DemoPrReview = { automationId: created.id, ...repo, channel: verdictChannel(state) };
  state.automations.push(created);
  state.prReviews.push(review);
  logActivity(state, { actor: "user", action: "pr_review_enabled", summary: `Turned on pull-request review for ${name}` });
  emit(state, "automation.updated", created);
  return json(toPrReview(state, review));
};

/** Turns review off for one repo: the automation goes, and with it the standing OK to comment there. */
export const disablePrReview: Handler = ({ state, params }) => {
  const repo = repoRef(params);
  const review = findReview(state, repo);
  if (!review) throw notFound("Pull-request review is not on for this repo");

  state.prReviews = state.prReviews.filter((item) => item !== review);
  state.automations = state.automations.filter((item) => item.id !== review.automationId);
  logActivity(state, { actor: "user", action: "pr_review_disabled", summary: `Turned off pull-request review for ${review.owner}/${review.repo}` });
  return noContent();
};
