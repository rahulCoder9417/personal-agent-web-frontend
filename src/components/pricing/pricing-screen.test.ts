import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Pricing screen in each state an account can be in, drawn from the demo account's data (the
// demo backend answers as the real one would): Free, Pro, Max, a cancelled plan, a failed payment,
// and while it loads or when it doesn't. What the Cancel button does is clicked through in
// cancel-plan.test.ts.

vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import PricingPage from "@/app/(app)/pricing/page";
import { ApiError, type CreditBalance, type PlanId, type Subscription } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { formatDate } from "@/lib/format";

const NOW = new Date("2026-10-01T14:30:00");

/** What the demo backend answers, as the proxy route would hand it on. */
async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}

function client() {
  // A failed load stays failed when it is drawn, instead of being asked for again.
  return new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
}

/** The demo account on `plan`, with its subscription changed when a case needs it. */
async function account(plan: PlanId, change?: (subscription: Subscription) => Subscription) {
  vi.stubEnv("TEXTCREW_DEMO_PLAN", plan);
  resetDemoStore(NOW);
  const qc = client();
  const subscription = await demo<Subscription>("billing/subscription");
  qc.setQueryData(qk.plans, await demo("billing/plans"));
  qc.setQueryData(qk.subscription, change ? change(subscription) : subscription);
  qc.setQueryData(qk.credits, await demo("credits"));
  qc.setQueryData(qk.crew, await demo("crew"));
  return { qc, subscription: change ? change(subscription) : subscription, credits: await demo<CreditBalance>("credits") };
}

const draw = (qc: QueryClient) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(PricingPage)));
/** The page's text, without the markup. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** The markup of one part of the page, from its opening tag to the next part's. */
const part = (html: string, label: string) => {
  const start = html.indexOf(`aria-label="${label}"`);
  return start === -1 ? "" : html.slice(start, start + 12_000);
};
const yourPlan = (html: string) => {
  const start = html.indexOf('aria-label="Your plan"');
  const end = html.indexOf('id="plans"');
  return html.slice(start, end);
};
const column = (html: string, name: string) => {
  const start = html.indexOf(`aria-label="${name} plan"`);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("Pricing, its parts", () => {
  it("has the four sections in order, each with a line that says what it is", async () => {
    const { qc } = await account("pro");
    const html = draw(qc);
    const headings = ["Your plan", "Plans", "Top-ups", "How credits work"];
    const at = headings.map((heading) => html.indexOf(`>${heading}</h2>`));
    expect(at.every((index) => index > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const words = text(html);
    expect(words).toContain("What you pay now, what happens next, and the credits you have.");
    expect(words).toContain("Pro and Max add credits every month and unlock more.");
    expect(words).toContain("Extra credits for when you run low, on Pro and Max.");
    expect(words).toContain("1 credit is about 1 cent.");
    expect(html).toContain(">Pricing</h1>");
  });

  it("says how credits work, the same as Help, and leads to Help's credits", async () => {
    const { qc } = await account("pro");
    const words = text(draw(qc));
    for (const line of ["What uses credits", "Your agent’s running time", "They last 90 days", "At zero, Tex pauses", "Failed tasks are refunded"]) {
      expect(words).toContain(line);
    }
    expect(draw(qc)).toMatch(/<a [^>]*href="\/help#credits"[^>]*>More about credits in Help<\/a>/);
  });

  it("says nothing about an automatic top-up, which the backend doesn't have", async () => {
    const { qc } = await account("pro");
    expect(text(draw(qc)).toLowerCase()).not.toMatch(/auto[- ]?top|automatic/);
  });

  it("shows the waitlist offer and who handles payment", async () => {
    const { qc } = await account("free");
    const words = text(draw(qc));
    expect(words).toContain("Waitlist members get 50% off their first month of Pro or Max.");
    expect(words).toContain("Checkout and billing are handled by Polar; we never see card details.");
  });
});

describe("Pricing on Pro", () => {
  it("shows the plan, its price, when it renews and for how much, and a Cancel plan button", async () => {
    const { qc, subscription } = await account("pro");
    const card = yourPlan(draw(qc));
    const words = text(card);
    expect(words).toContain("Pro");
    expect(words).toContain("Active");
    expect(words).toContain("$19 per month");
    expect(words).toContain("Launch price (regular $30 a month)");
    expect(words).toContain(`Renews on ${formatDate(subscription.currentPeriodEnd!)} for $19.`);
    expect(card).toMatch(/<button [^>]*>Cancel plan<\/button>/);
  });

  it("shows the credits left, when the next ones expire, and what the next renewal brings", async () => {
    const { qc, credits, subscription } = await account("pro");
    const words = text(yourPlan(draw(qc)));
    const next = [...credits.grants].filter((g) => g.remaining > 0 && g.expiresAt).sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!))[0];
    expect(words).toContain(`${credits.balance.toLocaleString("en-US")} credits`);
    expect(words).toContain(`${next.remaining.toLocaleString("en-US")} expire on ${formatDate(next.expiresAt!)}.`);
    expect(words).toContain(`Your next 1,500 arrive when Pro renews on ${formatDate(subscription.currentPeriodEnd!)}.`);
    expect(yourPlan(draw(qc))).toMatch(/<a [^>]*href="\/settings\/credits"[^>]*>See your credit history<\/a>/);
  });

  it("lists what the plan includes", async () => {
    const { qc } = await account("pro");
    const words = text(yourPlan(draw(qc)));
    expect(words).toContain("What it includes");
    for (const line of ["1,500 credits every month", "All 25 apps", "5 automations", "Top-ups: $10 for 800 credits"]) expect(words).toContain(line);
  });

  it("marks Pro as yours among the three, and asks to cancel before Max", async () => {
    const { qc } = await account("pro");
    const html = draw(qc);
    for (const name of ["Free", "Pro", "Max"]) expect(column(html, name)).not.toBe("");
    expect(column(html, "Pro")).toContain("Your plan");
    expect(column(html, "Pro")).toContain("Current plan");
    expect(column(html, "Max")).not.toContain("Your plan");
    expect(text(column(html, "Max"))).toContain("$30 per month");
    expect(text(column(html, "Max"))).toContain("4,500 credits every month");
    expect(column(html, "Max")).toMatch(/<button [^>]*disabled=""[^>]*>Switch to Max<\/button>/);
    expect(text(column(html, "Max"))).toContain("Cancel Pro first. Max can start when it ends.");
  });

  it("offers the top-up with its price and a Buy button", async () => {
    const { qc } = await account("pro");
    const topUp = part(draw(qc), "Top-up: 800 credits");
    expect(text(topUp)).toContain("$10 for 800 credits");
    expect(text(topUp)).toContain("Good for 90 days from the day you buy them.");
    expect(topUp).toMatch(/<button [^>]*>Buy a top-up<\/button>/);
  });
});

describe("Pricing on Free", () => {
  it("shows Free at $0 with no renewal and nothing to cancel", async () => {
    const { qc } = await account("free");
    const card = yourPlan(draw(qc));
    const words = text(card);
    expect(words).toContain("Free");
    expect(words).toContain("$0 forever");
    expect(words).toContain("You’re on Free. Pick a plan below when you want credits every month.");
    expect(card).not.toContain("Cancel plan");
    expect(words).not.toContain("Renews");
    expect(words).not.toContain("Your next");
  });

  it("marks Free as yours and offers Upgrade to Pro and to Max through checkout", async () => {
    const { qc } = await account("free");
    const html = draw(qc);
    expect(column(html, "Free")).toContain("Your plan");
    expect(column(html, "Pro")).toMatch(/<button [^>]*>Upgrade to Pro<\/button>/);
    expect(column(html, "Max")).toMatch(/<button [^>]*>Upgrade to Max<\/button>/);
  });

  it("shows the launch prices with the regular price in plain words, never struck out", async () => {
    const { qc } = await account("free");
    const html = draw(qc);
    expect(text(column(html, "Pro"))).toContain("$19 per month Launch price (regular $30 a month)");
    expect(text(column(html, "Max"))).toContain("$30 per month Launch price (regular $50 a month)");
    expect(text(column(html, "Free"))).not.toContain("Launch price");
    expect(html).not.toMatch(/<(s|del|strike)[ >]|line-through/);
  });

  it("still shows the top-up's price, without a Buy button, and leads to the plans", async () => {
    const { qc } = await account("free");
    const topUp = part(draw(qc), "Top-up: 800 credits");
    expect(text(topUp)).toContain("$10 for 800 credits");
    expect(topUp).not.toContain("Buy a top-up");
    expect(text(topUp)).toContain("Top-ups come with Pro and Max.");
    expect(topUp).toMatch(/<a [^>]*href="#plans"[^>]*>Pick a plan<\/a>/);
  });
});

describe("Pricing on Max", () => {
  it("shows Max at $30 with its renewal, Cancel plan, and what Max includes", async () => {
    const { qc, subscription } = await account("max");
    const html = draw(qc);
    const words = text(yourPlan(html));
    expect(words).toContain("$30 per month");
    expect(words).toContain(`Renews on ${formatDate(subscription.currentPeriodEnd!)} for $30.`);
    expect(words).toContain("Your next 4,500 arrive when Max renews");
    expect(words).toContain("Browser use: 2 credits per minute");
    expect(yourPlan(html)).toContain("Cancel plan");
    expect(column(html, "Max")).toContain("Your plan");
    expect(column(html, "Pro")).toMatch(/<button [^>]*disabled=""[^>]*>Switch to Pro<\/button>/);
  });
});

describe("Pricing once the plan is cancelled", () => {
  it("says when it ends and that Free comes next, with no Cancel button (Keep my plan is in the plan's column)", async () => {
    const { qc, subscription } = await account("pro", (s) => ({ ...s, status: "cancel_at_period_end" }));
    const card = yourPlan(draw(qc));
    const words = text(card);
    const end = formatDate(subscription.currentPeriodEnd!);
    expect(words).toContain("Cancelled");
    expect(words).toContain(`Ends on ${end}. You keep Pro until then, then move to Free.`);
    expect(words).toContain("No more monthly credits come once Pro ends.");
    expect(card).not.toContain("Cancel plan");
    expect(words).not.toContain("Keep my plan");
  });

  it("lets Pro be kept (never a second paid month), or Max start, from the plans", async () => {
    const { qc } = await account("pro", (s) => ({ ...s, status: "cancel_at_period_end" }));
    const html = draw(qc);
    expect(column(html, "Pro")).toMatch(/<button [^>]*>Keep my plan<\/button>/);
    expect(text(column(html, "Pro"))).toContain("Keep it and it renews as before; nothing is charged today.");
    expect(column(html, "Pro")).not.toContain("Subscribe to Pro again");
    expect(column(html, "Max")).toMatch(/<button [^>]*>Start Max<\/button>/);
  });
});

describe("Pricing after a failed payment", () => {
  it("says what happened and still lets the plan be cancelled", async () => {
    const { qc } = await account("pro", (s) => ({ ...s, status: "past_due" }));
    const card = yourPlan(draw(qc));
    expect(text(card)).toContain("Payment failed");
    expect(text(card)).toContain("The last payment for Pro didn’t go through.");
    expect(card).toContain("Cancel plan");
  });
});

describe("Pricing while it loads, and when it doesn't", () => {
  it("shows the page's shape while the plans and the subscription load", () => {
    const html = draw(client());
    expect(html).toContain(">Pricing</h1>");
    expect(html).toContain("data-loading");
    expect(html).not.toContain(">Your plan</h2>");
  });

  it("says it didn't load, with the API's reason and Try again", async () => {
    const qc = client();
    await qc.prefetchQuery({ queryKey: qk.plans, queryFn: () => Promise.reject(new ApiError(503, "unavailable", "Billing is down for a moment.")) });
    await qc.prefetchQuery({ queryKey: qk.subscription, queryFn: () => Promise.resolve({ plan: "pro", status: "active" }) });
    const html = draw(qc);
    expect(text(html)).toContain("That didn’t load");
    expect(text(html)).toContain("Billing is down for a moment.");
    expect(html).toMatch(/<button [^>]*>Try again<\/button>/);
    expect(html).not.toContain(">Your plan</h2>");
  });

  it("when only the credits don't load, shows the rest and says so where the credits go", async () => {
    const { qc } = await account("pro");
    qc.removeQueries({ queryKey: qk.credits });
    await qc.prefetchQuery({ queryKey: qk.credits, queryFn: () => Promise.reject(new ApiError(500, "internal", "Couldn’t read your credits.")) });
    const card = yourPlan(draw(qc));
    expect(text(card)).toContain("That didn’t load");
    expect(text(card)).toContain("Couldn’t read your credits.");
    expect(text(card)).toContain("What it includes");
  });
});
