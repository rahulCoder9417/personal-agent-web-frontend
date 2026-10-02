import type { CreditBalance, Plan, PlanId, Subscription } from "./api/client";

// Polar checkout happens outside the app (on Polar's page), and the backend
// only changes the plan or adds credits when Polar's webhook reaches it. So after starting a
// checkout the app remembers what it is waiting for and watches until it arrives.

export type PendingCheckout =
  | { kind: "plan"; planId: PlanId; discountApplied: boolean; startedAt: string }
  | { kind: "topup"; topUpId: string; credits: number; startedAt: string };

const KEY = "textcrew.pendingCheckout";
const EVENT = "textcrew:checkout";
/** After this long a checkout was abandoned, or its webhook isn't coming while we watch. */
export const CHECKOUT_MAX_AGE_MS = 30 * 60_000;
/** Server and local clocks may disagree a little. */
const CLOCK_SLACK_MS = 2 * 60_000;

export function parsePending(raw: string | null, now = Date.now()): PendingCheckout | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingCheckout;
    const started = new Date(value.startedAt).getTime();
    if (!Number.isFinite(started) || now - started > CHECKOUT_MAX_AGE_MS) return null;
    if (value.kind === "plan" && typeof value.planId === "string") return value;
    if (value.kind === "topup" && typeof value.topUpId === "string") return value;
    return null;
  } catch {
    return null;
  }
}

// useSyncExternalStore needs the same object back while nothing changed.
let cachedRaw: string | null | undefined;
let cachedValue: PendingCheckout | null = null;

export function readPendingCheckout(): PendingCheckout | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage can be unavailable (private mode); then there is simply nothing to watch.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parsePending(raw);
  }
  return cachedValue;
}

function store(value: PendingCheckout | null) {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
  } catch {
    // See readPendingCheckout.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function startPendingCheckout(checkout: PendingCheckout) {
  store(checkout);
}

export function clearPendingCheckout() {
  store(null);
}

/** Fires for changes made in this window and in the app's other windows. */
export function subscribePendingCheckout(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export type CheckoutResult = { title: string; body: string };

/**
 * Has what was paid for arrived? Returns the confirmation to show, or null to keep waiting.
 * A plan has arrived when the subscription is live on that plan with a period that began around
 * the checkout (so re-subscribing to the same plan is recognised too). A top-up has arrived when
 * a top-up grant newer than the checkout exists.
 */
export function checkoutResult(
  pending: PendingCheckout,
  state: { subscription?: Subscription; credits?: CreditBalance; plans?: Plan[] },
): CheckoutResult | null {
  const since = new Date(pending.startedAt).getTime() - CLOCK_SLACK_MS;

  if (pending.kind === "topup") {
    const grant = state.credits?.grants.find((g) => g.source === "topup" && new Date(g.createdAt).getTime() >= since);
    if (!grant) return null;
    return { title: `${grant.amount.toLocaleString("en-US")} credits added`, body: "Your top-up is in. Tex can carry on." };
  }

  const subscription = state.subscription;
  if (!subscription || subscription.plan !== pending.planId || subscription.status !== "active") return null;
  const periodStart = subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).getTime() : 0;
  if (periodStart < since) return null;
  const plan = state.plans?.find((p) => p.id === pending.planId);
  const name = plan?.name ?? pending.planId;
  return {
    title: `You’re on ${name}`,
    body: plan ? `${plan.monthlyCredits.toLocaleString("en-US")} credits added for this month.` : "Your monthly credits are in.",
  };
}

/** What a plan's button should do, given the backend's rules for switching (see billing/polar.ts). */
export type PlanAction =
  | { type: "current" }
  | { type: "current-ending" } // cancelled at period end: may subscribe again
  | { type: "checkout"; verb: "Upgrade to" | "Switch to" | "Start" }
  | { type: "blocked"; reason: string }
  | { type: "free" };

export function planAction(plan: Plan, currentPlan: Plan | undefined, subscription: Subscription): PlanAction {
  const isCurrent = plan.id === subscription.plan;
  const paid = plan.priceCents > 0;
  // A subscription that will renew. The backend refuses a second one alongside it.
  const renewing = subscription.status === "active" || subscription.status === "past_due";

  if (isCurrent) return paid && subscription.status === "cancel_at_period_end" ? { type: "current-ending" } : { type: "current" };
  if (!paid) return { type: "free" };
  if (renewing && currentPlan && currentPlan.priceCents > 0) {
    return { type: "blocked", reason: `Cancel ${currentPlan.name} first. ${plan.name} can start when it ends.` };
  }
  if (subscription.status === "cancel_at_period_end") return { type: "checkout", verb: "Start" };
  return { type: "checkout", verb: plan.priceCents > (currentPlan?.priceCents ?? 0) ? "Upgrade to" : "Switch to" };
}
