// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pricing, clicked through against the demo backend: "Keep my plan" after a cancel, Cancel after a
// failed payment, and auto top-up, which is hidden unless the server allows it.

const net = vi.hoisted(() => {
  const state = {
    handle: null as null | ((request: Request) => Promise<Response>),
    /** Answer this path with a 409 instead (method + path). */
    refuse: null as null | string,
    calls: [] as string[],
    bodies: [] as unknown[],
  };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    const key = `${request.method} ${new URL(request.url).pathname}`;
    state.calls.push(key);
    if (request.method === "PUT") state.bodies.push(await request.clone().json());
    if (state.refuse === key) return Response.json({ error: { code: "conflict", message: "No cancelled plan to keep" } }, { status: 409 });
    return state.handle!(request);
  };
  return state;
});

const toasts = vi.hoisted(() => ({ done: [] as { title: string; body?: string }[], failed: [] as { title: string; detail: unknown }[] }));
vi.mock("@/components/toast", () => ({
  toast: (message: { title: string; body?: string }) => toasts.done.push(message),
  toastError: (title: string, detail: unknown) => toasts.failed.push({ title, detail }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import PricingPage from "@/app/(app)/pricing/page";
import type { Subscription } from "@/lib/api/client";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { formatDate } from "@/lib/format";
import { HELP_SECTIONS, helpSectionsFor } from "@/lib/help-content";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const api = (path: string, init?: RequestInit) => net.handle!(new Request(`http://localhost:3000/api/v1/${path}`, init));

function start(plan: "pro" | "free" = "pro", autoTopUp = false) {
  vi.stubEnv("TEXTCREW_DEMO_PLAN", plan);
  if (autoTopUp) vi.stubEnv("TEXTCREW_DEMO_AUTO_TOPUP", "on");
  return resetDemoStore(new Date("2026-10-01T14:30:00"));
}

beforeEach(() => {
  net.handle = (request) => handleDemoRequest(request, new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/"));
  net.refuse = null;
  net.calls = [];
  net.bodies = [];
  toasts.done = [];
  toasts.failed = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host.remove();
  vi.unstubAllEnvs();
});

async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => root!.render(createElement(QueryClientProvider, { client }, createElement(PricingPage))));
  await settle();
}

const dialog = () => host.querySelector("dialog");
const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ");
const button = (name: string, where: "page" | "dialog" = "page") =>
  [...host.querySelectorAll("button")].find((b) => (where === "dialog") === Boolean(b.closest("dialog")) && b.textContent?.trim() === name);
const proColumn = () => host.querySelector('[aria-label="Pro plan"]');
const yourPlan = () => host.querySelector('[aria-label="Your plan"]');

async function press(name: string, where: "page" | "dialog" = "page") {
  const target = button(name, where);
  if (!target) throw new Error(`no button "${name}" (${where})`);
  await act(async () => target.click());
  await settle(3);
}

describe("Keep my plan", () => {
  it("after a cancel, the plan's column offers Keep my plan; the dialog says it renews; then it renews again", async () => {
    start();
    await api("billing/subscription/cancel", { method: "POST" });
    const sub = (await (await api("billing/subscription")).json()) as Subscription;
    const end = formatDate(sub.currentPeriodEnd!);
    await draw();

    expect(text(yourPlan())).toContain(`Ends on ${end}`);
    expect(text(proColumn())).toContain("Keep my plan");
    expect(text(proColumn())).not.toContain("Subscribe to Pro again");
    expect(text(proColumn())).toContain(`Yours ends ${end}. Keep it and it renews as before; nothing is charged today.`);

    await press("Keep my plan");
    expect(dialog()?.open).toBe(true);
    expect(text(dialog())).toContain("Keep your Pro plan?");
    expect(text(dialog())).toContain(`Pro renews on ${end} instead of ending. Polar charges your card $19 then, as before. Nothing is charged today.`);
    // "Not now" changes nothing.
    await press("Not now", "dialog");
    expect(net.calls).not.toContain("POST /api/v1/billing/subscription/resume");

    await press("Keep my plan");
    await press("Keep my plan", "dialog");
    await settle();
    expect(net.calls.filter((c) => c === "POST /api/v1/billing/subscription/resume")).toHaveLength(1);
    expect(toasts.done).toEqual([{ title: "You’re keeping Pro", body: `It renews on ${end} for $19.` }]);
    expect(dialog()).toBeNull();
    expect(text(yourPlan())).toContain(`Renews on ${end} for $19.`);
    expect(button("Cancel plan")).toBeDefined();
    expect(button("Keep my plan")).toBeUndefined();
  });

  it("says why in a toast when it is refused, and keeps the page as it was", async () => {
    start();
    await api("billing/subscription/cancel", { method: "POST" });
    await draw();
    net.refuse = "POST /api/v1/billing/subscription/resume";
    await press("Keep my plan");
    await press("Keep my plan", "dialog");
    await settle();
    expect(toasts.failed.map((f) => f.title)).toEqual(["Couldn’t keep Pro"]);
    expect(String(toasts.failed[0].detail)).toContain("no cancelled plan to keep");
    expect(toasts.done).toEqual([]);
    expect(button("Keep my plan")).toBeDefined();
  });

  it("the demo backend refuses Keep my plan when nothing is cancelled, and allows Cancel after a failed payment", async () => {
    const state = start();
    expect((await api("billing/subscription/resume", { method: "POST" })).status).toBe(409);
    state.subscription = { ...state.subscription, status: "past_due" };
    const res = await api("billing/subscription/cancel", { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Subscription).status).toBe("cancel_at_period_end");
    expect((await api("billing/subscription/resume", { method: "POST" })).status).toBe(200);
  });
});

describe("Auto top-up", () => {
  it("is hidden when the server has it off, and the page still says nothing is charged at zero", async () => {
    start();
    await draw();
    expect(host.querySelector("#auto-top-up")).toBeNull();
    expect(text(host)).not.toContain("Auto top-up");
    expect(text(host)).toContain("Nothing is charged to your card");
    expect(helpSectionsFor({ autoTopUp: false })).toBe(HELP_SECTIONS);
  });

  it("when allowed: switching on needs the box ticked, says the price, and then shows what it does", async () => {
    start("pro", true);
    await draw();
    const section = () => host.querySelector('[aria-label="Auto top-up"]');
    expect(section()).not.toBeNull();
    expect(text(host)).not.toContain("Nothing is charged to your card");
    expect(text(host)).toContain("Your card is charged only if you switch on auto top-up.");
    expect(text(section())).toContain("Each top-up is $10 for 800 credits, plus tax where it applies. At most 2 times a month, so $20 a month at the very most.");
    expect(text(section())).toContain(
      "I allow Textcrew to have Polar charge the card Polar keeps for your plan $10 for 800 credits each time my balance drops under 100 credits, at most 2 times a month.",
    );
    expect(button("Switch on auto top-up")?.disabled).toBe(true);

    const box = section()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => box.click());
    expect(button("Switch on auto top-up")?.disabled).toBe(false);
    await press("Switch on auto top-up");
    await settle();

    expect(net.bodies).toEqual([{ enabled: true, thresholdCredits: 100, monthlyCap: 2, topUpId: "topup_10", consent: true }]);
    expect(toasts.done.map((t) => t.title)).toEqual(["Auto top-up is on"]);
    expect(text(section())).toContain("On");
    expect(text(section())).toContain("When you have under 100 credits, Polar charges your Visa ending 4242 $10 for 800 credits, at most 2 times a month.");
    expect(text(section())).toContain("This month: 0 of 2.");

    await press("Switch off");
    await settle();
    expect(net.bodies.at(-1)).toEqual({ enabled: false });
    expect(toasts.done.map((t) => t.title)).toEqual(["Auto top-up is on", "Auto top-up is off"]);
    expect(button("Switch on auto top-up")).toBeDefined();
  });

  it("on Free it says it comes with Pro and Max, with nothing to switch on", async () => {
    start("free", true);
    await draw();
    const section = host.querySelector('[aria-label="Auto top-up"]');
    expect(text(section)).toContain("Auto top-up comes with Pro and Max, like top-ups.");
    expect(button("Switch on auto top-up")).toBeUndefined();
  });

  it("says when it switched itself off", async () => {
    const state = start("pro", true);
    state.autoTopUp = {
      ...state.autoTopUp,
      turnedOffReason: "declined",
      lastAttempt: { status: "declined", at: "2026-10-01T10:00:00Z", credits: 800, amountCents: 1000 },
    };
    await draw();
    expect(text(host.querySelector('[aria-label="Auto top-up"]'))).toContain(
      "Auto top-up switched itself off: your card was declined twice, so nothing was charged.",
    );
  });

  it("Help has the auto top-up answer only while it is allowed", () => {
    const ids = (on: boolean) => helpSectionsFor({ autoTopUp: on }).flatMap((s) => s.topics.map((t) => t.id));
    expect(ids(false)).not.toContain("credits-auto-topup");
    expect(ids(true)).toContain("credits-auto-topup");
    expect(ids(true).indexOf("credits-auto-topup")).toBe(ids(true).indexOf("credits-zero") + 1);
  });
});
