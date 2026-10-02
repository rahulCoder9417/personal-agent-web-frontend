import { describe, expect, it } from "vitest";
import type { CreditBalance, Plan, Subscription } from "./api/client";
import { CHECKOUT_MAX_AGE_MS, checkoutResult, parsePending, planAction, type PendingCheckout } from "./checkout";

const limits = { apps: 25, automations: 5, ownMcpServers: false, topUps: true, models: "all" as const };
const plan = (id: Plan["id"], priceCents: number, monthlyCredits: number): Plan => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  priceCents,
  interval: priceCents ? "month" : null,
  monthlyCredits,
  signupCredits: 0,
  limits,
  features: [],
});
const FREE = plan("free", 0, 0);
const PRO = plan("pro", 1200, 1500);
const MAX = plan("max", 3000, 4500);
const PLANS = [FREE, PRO, MAX];

const STARTED = "2026-10-02T10:00:00.000Z";
const sub = (over: Partial<Subscription>): Subscription => ({ plan: "free", status: "none", currentPeriodStart: null, currentPeriodEnd: null, ...over });

describe("parsePending", () => {
  const now = new Date(STARTED).getTime() + 60_000;

  it("reads back what was stored", () => {
    const pending: PendingCheckout = { kind: "plan", planId: "pro", discountApplied: true, startedAt: STARTED };
    expect(parsePending(JSON.stringify(pending), now)).toEqual(pending);
  });

  it("forgets an old checkout and ignores junk", () => {
    const pending = JSON.stringify({ kind: "topup", topUpId: "topup_10", credits: 800, startedAt: STARTED });
    expect(parsePending(pending, new Date(STARTED).getTime() + CHECKOUT_MAX_AGE_MS + 1)).toBeNull();
    expect(parsePending("{not json", now)).toBeNull();
    expect(parsePending(JSON.stringify({ kind: "plan", startedAt: STARTED }), now)).toBeNull();
    expect(parsePending(null, now)).toBeNull();
  });
});

describe("checkoutResult", () => {
  const planCheckout: PendingCheckout = { kind: "plan", planId: "pro", discountApplied: false, startedAt: STARTED };

  it("keeps waiting until the webhook has changed the plan", () => {
    expect(checkoutResult(planCheckout, { subscription: sub({}), plans: PLANS })).toBeNull();
    expect(checkoutResult(planCheckout, { plans: PLANS })).toBeNull();
  });

  it("confirms the new plan with its credits", () => {
    const subscription = sub({ plan: "pro", status: "active", currentPeriodStart: "2026-10-02T10:01:10.000Z" });
    expect(checkoutResult(planCheckout, { subscription, plans: PLANS })).toEqual({
      title: "You’re on Pro",
      body: "1,500 credits added for this month.",
    });
  });

  it("doesn't mistake the old subscription for a new one when re-subscribing to the same plan", () => {
    const old = sub({ plan: "pro", status: "active", currentPeriodStart: "2026-09-10T00:00:00.000Z" });
    expect(checkoutResult(planCheckout, { subscription: old, plans: PLANS })).toBeNull();
    const ending = sub({ plan: "pro", status: "cancel_at_period_end", currentPeriodStart: "2026-10-02T10:01:00.000Z" });
    expect(checkoutResult(planCheckout, { subscription: ending, plans: PLANS })).toBeNull();
  });

  it("confirms a top-up only from a grant made after checkout started", () => {
    const pending: PendingCheckout = { kind: "topup", topUpId: "topup_10", credits: 800, startedAt: STARTED };
    const grant = (source: CreditBalance["grants"][number]["source"], createdAt: string) => ({
      id: createdAt,
      source,
      amount: 800,
      remaining: 800,
      cheapModelOnly: false,
      createdAt,
    });
    const before: CreditBalance = { balance: 800, grants: [grant("topup", "2026-09-01T00:00:00.000Z"), grant("monthly", "2026-10-02T10:02:00.000Z")] };
    expect(checkoutResult(pending, { credits: before })).toBeNull();
    const after: CreditBalance = { balance: 1600, grants: [...before.grants, grant("topup", "2026-10-02T10:02:30.000Z")] };
    expect(checkoutResult(pending, { credits: after })?.title).toBe("800 credits added");
  });
});

describe("planAction", () => {
  it("lets a Free account upgrade", () => {
    expect(planAction(PRO, FREE, sub({}))).toEqual({ type: "checkout", verb: "Upgrade to" });
    expect(planAction(FREE, FREE, sub({}))).toEqual({ type: "current" });
  });

  it("blocks a second plan while the first will renew, as the backend does", () => {
    const active = sub({ plan: "pro", status: "active" });
    expect(planAction(MAX, PRO, active)).toEqual({ type: "blocked", reason: "Cancel Pro first. Max can start when it ends." });
    expect(planAction(PRO, PRO, active)).toEqual({ type: "current" });
    expect(planAction(FREE, PRO, active)).toEqual({ type: "free" });
    expect(planAction(MAX, PRO, sub({ plan: "pro", status: "past_due" })).type).toBe("blocked");
  });

  it("allows a new plan once the current one is set to end", () => {
    const ending = sub({ plan: "pro", status: "cancel_at_period_end" });
    expect(planAction(MAX, PRO, ending)).toEqual({ type: "checkout", verb: "Start" });
    expect(planAction(PRO, PRO, ending)).toEqual({ type: "current-ending" });
  });

  it("lets a plan granted without a subscription be switched", () => {
    expect(planAction(MAX, PRO, sub({ plan: "pro", status: "none" }))).toEqual({ type: "checkout", verb: "Upgrade to" });
    expect(planAction(PRO, MAX, sub({ plan: "max", status: "none" }))).toEqual({ type: "checkout", verb: "Switch to" });
  });
});
