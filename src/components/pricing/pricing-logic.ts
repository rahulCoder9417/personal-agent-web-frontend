import type { Plan, Subscription, TopUpPack } from "@/lib/api/client";
import type { PillTone } from "@/components/ui";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

// The Pricing screen in words: what a plan includes, what the subscription will do next, and what
// cancelling means. Kept apart from the markup so each sentence can be tested.

/** What a plan includes, read from its numbers. Used when the API sends no feature list of its own. */
function derivedFeatures(plan: Plan, topUp: TopUpPack | undefined): string[] {
  const lines: string[] = [];
  if (plan.monthlyCredits > 0) lines.push(`${formatNumber(plan.monthlyCredits)} credits every month`);
  if (plan.signupCredits > 0) lines.push(`${formatNumber(plan.signupCredits)} credits at sign-up, plus coupon codes`);
  lines.push(`${formatNumber(plan.limits.apps)} apps${plan.limits.ownMcpServers ? " plus your own MCP servers" : ""}`);
  lines.push(`${formatNumber(plan.limits.automations)} ${plan.limits.automations === 1 ? "automation" : "automations"}`);
  if (plan.limits.browser) lines.push("Browser use: 2 credits per minute");
  if (plan.limits.topUps) {
    lines.push(topUp ? `Top-ups: ${formatMoney(topUp.priceCents)} for ${formatNumber(topUp.credits)} credits` : "Top-ups when you need more");
  }
  return lines;
}

/** The lines a plan lists: the API's own, or read from its numbers when it sends none. */
export function planFeatures(plan: Plan, topUp: TopUpPack | undefined): string[] {
  return plan.features.length > 0 ? plan.features : derivedFeatures(plan, topUp);
}

/** "per month", or "forever" for Free. */
export function planInterval(plan: Plan): string {
  return plan.interval ? `per ${plan.interval}` : "forever";
}

/** The mark beside the plan's name. Free with no subscription needs none. */
export const STATUS: Record<Subscription["status"], { label: string; tone: PillTone } | null> = {
  none: null,
  active: { label: "Active", tone: "done" },
  cancel_at_period_end: { label: "Cancelled", tone: "waiting" },
  past_due: { label: "Payment failed", tone: "danger" },
  cancelled: { label: "Ended", tone: "muted" },
};

/** When the paid period ends, as a date, or null when the backend doesn't say. */
function periodEnd(subscription: Subscription): string | null {
  return subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : null;
}

/** The line under the plan's name: what happens next, in words. */
export function describeSubscription(subscription: Subscription, plan: Plan | undefined): string {
  const name = plan?.name ?? "your plan";
  const end = periodEnd(subscription);
  const price = plan && plan.priceCents > 0 ? formatMoney(plan.priceCents) : null;

  switch (subscription.status) {
    case "active":
      if (!end) return price ? `Renews every month for ${price}.` : "Renews every month.";
      return price ? `Renews on ${end} for ${price}.` : `Renews on ${end}.`;
    case "cancel_at_period_end":
      return end ? `Ends on ${end}. You keep ${name} until then, then move to Free.` : `Ends with this period. You keep ${name} until then, then move to Free.`;
    case "past_due":
      return `The last payment for ${name} didn’t go through. Polar will try again and has emailed you a link to update your card. You keep ${name} in the meantime.`;
    case "cancelled":
      return end ? `Ended on ${end}. You’re on Free now.` : "Your subscription has ended. You’re on Free now.";
    case "none":
      return "You’re on Free. Pick a plan below when you want credits every month.";
  }
}

/**
 * Whether there is a paid plan that will renew, which Cancel stops at the end of the period. The
 * backend cancels an active subscription or one whose payment failed (it refuses anything else).
 */
export function canCancel(subscription: Subscription): boolean {
  return subscription.plan !== "free" && (subscription.status === "active" || subscription.status === "past_due");
}

/** What arrives next from the plan, for the credits beside it; null when nothing more comes. */
export function nextMonthlyCredits(subscription: Subscription, plan: Plan | undefined): string | null {
  if (!plan || plan.monthlyCredits <= 0) return null;
  const amount = formatNumber(plan.monthlyCredits);
  const end = periodEnd(subscription);
  switch (subscription.status) {
    case "active":
      return end ? `Your next ${amount} arrive when ${plan.name} renews on ${end}.` : `Your next ${amount} arrive when ${plan.name} renews.`;
    case "cancel_at_period_end":
      return `No more monthly credits come once ${plan.name} ends.`;
    default:
      return null;
  }
}

export type CancelCopy = {
  title: string;
  /** What stays, and until when. */
  keep: string;
  /** Where the account lands, and what it keeps. */
  after: string;
  confirmLabel: string;
  cancelLabel: string;
  done: { title: string; body: string };
};

/** The confirm dialog's words before a plan is cancelled, and the toast after. */
export function cancelCopy(plan: Plan | undefined, subscription: Subscription, free: Plan | undefined): CancelCopy {
  const name = plan?.name ?? "your plan";
  const end = periodEnd(subscription);
  const until = end ? `until ${end}, the end of the period you’ve paid for` : "until the end of the period you’ve paid for";
  const freeLimits = free
    ? `: ${formatNumber(free.limits.apps)} apps and ${formatNumber(free.limits.automations)} ${free.limits.automations === 1 ? "automation" : "automations"}${free.limits.topUps ? "" : ", and no top-ups"}`
    : "";
  return {
    title: `Cancel your ${name} plan?`,
    keep: `You keep ${name} ${until}. It won’t renew, and Polar won’t charge you again.`,
    after: `Then you move to Free${freeLimits}. The credits you have stay until they expire.`,
    confirmLabel: "Cancel plan",
    cancelLabel: "Keep my plan",
    done: {
      title: `${plan?.name ?? "Your plan"} is cancelled`,
      body: end ? `You keep it until ${end}, then move to Free.` : "You keep it until the end of this period, then move to Free.",
    },
  };
}
