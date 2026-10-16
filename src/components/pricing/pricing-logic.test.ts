import { describe, expect, it } from "vitest";
import type { Plan, Subscription } from "@/lib/api/client";
import { canCancel, cancelCopy, describeSubscription, nextMonthlyCredits, planFeatures } from "./pricing-logic";

// The Pricing screen's sentences where the API leaves something out: no date for the period's end,
// no feature list, no Free plan to quote. The usual cases are drawn in pricing-screen.test.ts.

const limits = { apps: 25, automations: 5, ownMcpServers: false, topUps: true, models: "all" as const, browser: false };
const PRO: Plan = { id: "pro", name: "Pro", priceCents: 1200, interval: "month", monthlyCredits: 1500, signupCredits: 0, limits, features: [] };
const sub = (over: Partial<Subscription>): Subscription => ({ plan: "pro", status: "active", currentPeriodStart: null, currentPeriodEnd: null, ...over });

describe("the subscription in words, with no end date from the backend", () => {
  it("still says what happens next", () => {
    expect(describeSubscription(sub({}), PRO)).toBe("Renews every month for $12.");
    expect(describeSubscription(sub({ status: "cancel_at_period_end" }), PRO)).toBe("Ends with this period. You keep Pro until then, then move to Free.");
    expect(describeSubscription(sub({ plan: "free", status: "cancelled" }), undefined)).toBe("Your subscription has ended. You’re on Free now.");
    expect(nextMonthlyCredits(sub({}), PRO)).toBe("Your next 1,500 arrive when Pro renews.");
  });

  it("asks before cancelling without naming a date or Free's limits it doesn't have", () => {
    const copy = cancelCopy(PRO, sub({}), undefined);
    expect(copy.keep).toBe("You keep Pro until the end of the period you’ve paid for. It won’t renew, and Polar won’t charge you again.");
    expect(copy.after).toBe("Then you move to Free. The credits you have stay until they expire.");
    expect(copy.done).toEqual({ title: "Pro is cancelled", body: "You keep it until the end of this period, then move to Free." });
    expect([copy.confirmLabel, copy.cancelLabel]).toEqual(["Cancel plan", "Keep my plan"]);
  });
});

describe("what can be cancelled", () => {
  it("is a paid plan that will renew, or whose payment failed; nothing else", () => {
    expect(canCancel(sub({ status: "active" }))).toBe(true);
    expect(canCancel(sub({ status: "past_due" }))).toBe(true);
    expect(canCancel(sub({ status: "cancel_at_period_end" }))).toBe(false);
    expect(canCancel(sub({ status: "cancelled" }))).toBe(false);
    expect(canCancel(sub({ plan: "free", status: "none" }))).toBe(false);
  });
});

describe("what a plan includes", () => {
  it("is read from its numbers when the API sends no lines", () => {
    expect(planFeatures(PRO, { id: "topup_10", priceCents: 1000, credits: 800, expiresInDays: 90 })).toEqual([
      "1,500 credits every month",
      "25 apps",
      "5 automations",
      "Top-ups: $10 for 800 credits",
    ]);
    expect(planFeatures({ ...PRO, features: ["As the API says"] }, undefined)).toEqual(["As the API says"]);
  });
});
