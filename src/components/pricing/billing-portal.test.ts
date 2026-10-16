// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pricing → Your plan, clicked through against the demo backend: the button to Polar's billing page
// (invoices, receipts, the card), which says "Update card" after a failed payment.

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
const left = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("@/lib/navigate", () => ({ leaveTo: (url: string) => left.urls.push(url), openInNewTab: () => {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import PricingPage from "@/app/(app)/pricing/page";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";

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
  left.urls = [];
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

const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ");
const button = (name: string, where: "page" | "dialog" = "page") =>
  [...host.querySelectorAll("button")].find((b) => (where === "dialog") === Boolean(b.closest("dialog")) && b.textContent?.trim() === name);
const yourPlan = () => host.querySelector('[aria-label="Your plan"]');

async function press(name: string, where: "page" | "dialog" = "page") {
  const target = button(name, where);
  if (!target) throw new Error(`no button "${name}" (${where})`);
  await act(async () => target.click());
  await settle(3);
}

describe("Invoices and card", () => {
  it("on a paid plan, opens Polar's billing page", async () => {
    start();
    await draw();
    expect(text(yourPlan())).toContain("Invoices and card");
    await press("Invoices and card");
    await settle();
    expect(net.calls.filter((c) => c === "POST /api/v1/billing/portal")).toHaveLength(1);
    expect(left.urls).toEqual(["http://localhost:3000/connected?portal=demo"]);
    expect(toasts.failed).toEqual([]);
  });

  it("after a failed payment it says Update card, and the line under the plan says where", async () => {
    const state = start();
    state.subscription = { ...state.subscription, status: "past_due" };
    await draw();
    expect(button("Invoices and card")).toBeUndefined();
    expect(text(yourPlan())).toContain("Press Update card to change the card");
    await press("Update card");
    await settle();
    expect(left.urls).toHaveLength(1);
  });

  it("is not shown to someone who never bought anything; the demo backend refuses them too", async () => {
    start("free");
    await draw();
    expect(button("Invoices and card")).toBeUndefined();
    expect(button("Update card")).toBeUndefined();
    expect((await api("billing/portal", { method: "POST" })).status).toBe(409);
  });

  it("says why in a toast when Polar can't be reached", async () => {
    start();
    await draw();
    net.handle = async () => Response.json({ error: { code: "unavailable", message: "Polar could not be reached. Try again in a minute" } }, { status: 503 });
    await press("Invoices and card");
    await settle();
    expect(toasts.failed.map((f) => f.title)).toEqual(["Couldn’t open billing"]);
    expect(left.urls).toEqual([]);
  });
});
