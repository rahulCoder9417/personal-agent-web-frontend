// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cancelling a plan on Pricing, clicked through in a browser-like page: the Cancel plan button,
// the confirm dialog and what it says, the work under way, and what is said and shown afterwards.
// The requests go to the demo backend, which answers as the real one would.

// The page's requests, handed to the demo backend. `openapi-fetch` keeps the `fetch` it finds when
// the client is made, so this is in place before anything is imported.
const net = vi.hoisted(() => {
  const state = {
    handle: null as null | ((request: Request) => Promise<Response>),
    /** While set, a cancel waits for it before it is answered. */
    hold: null as null | Promise<void>,
    /** Answer a cancel with this status instead. */
    refuse: null as null | number,
    cancels: 0,
  };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    if (request.method === "POST" && new URL(request.url).pathname === "/api/v1/billing/subscription/cancel") {
      state.cancels += 1;
      if (state.hold) await state.hold;
      if (state.refuse) return Response.json({ error: { code: "unavailable", message: "Polar didn’t answer. Nothing was changed." } }, { status: state.refuse });
    }
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let periodEnd: string;

beforeEach(async () => {
  vi.stubEnv("TEXTCREW_DEMO_PLAN", "pro");
  resetDemoStore(new Date("2026-10-01T14:30:00"));
  net.handle = (request) => handleDemoRequest(request, new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/"));
  net.hold = null;
  net.refuse = null;
  net.cancels = 0;
  toasts.done = [];
  toasts.failed = [];
  const subscription = (await (await net.handle(new Request("http://localhost:3000/api/v1/billing/subscription"))).json()) as Subscription;
  periodEnd = formatDate(subscription.currentPeriodEnd!);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllEnvs();
});

/** Lets the requests and the renders they cause finish. */
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
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(PricingPage))));
  await settle();
}

const dialog = () => host.querySelector("dialog");
const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ");
/** A button by its words, on the card (outside the dialog) or in the dialog. */
const button = (name: string, where: "card" | "dialog" = "card") =>
  [...host.querySelectorAll("button")].find((b) => (where === "dialog") === Boolean(b.closest("dialog")) && b.textContent?.trim() === name);
const yourPlan = () => host.querySelector('[aria-label="Your plan"]');

async function press(name: string, where: "card" | "dialog" = "card") {
  const target = button(name, where);
  if (!target) throw new Error(`no button "${name}" (${where})`);
  await act(async () => target.click());
  await settle(2);
}

describe("Cancelling a plan", () => {
  it("asks first in a dialog that says what happens: kept until the period ends, then Free; Keep my plan changes nothing", async () => {
    await draw();
    expect(text(yourPlan())).toContain(`Renews on ${periodEnd} for $12.`);
    await press("Cancel plan");

    const open = dialog();
    expect(open?.open).toBe(true);
    expect(open?.getAttribute("role")).toBe("alertdialog");
    expect(text(open)).toContain("Cancel your Pro plan?");
    expect(text(open)).toContain(`You keep Pro until ${periodEnd}, the end of the period you’ve paid for. It won’t renew, and Polar won’t charge you again.`);
    expect(text(open)).toContain("Then you move to Free: 10 apps and 1 automation, and no top-ups. The credits you have stay until they expire.");
    // The keyboard starts on the way out, so Enter doesn't cancel anything.
    expect(host.ownerDocument.activeElement?.textContent).toBe("Keep my plan");

    await press("Keep my plan", "dialog");
    expect(dialog()).toBeNull();
    expect(net.cancels).toBe(0);
    expect(button("Cancel plan")).toBeDefined();
  });

  it("shows the work under way, then says it is cancelled and the card says when it ends, without a reload", async () => {
    await draw();
    await press("Cancel plan");

    let release!: () => void;
    net.hold = new Promise((resolve) => (release = resolve));
    await press("Cancel plan", "dialog");

    const confirm = button("Cancel plan", "dialog");
    expect(confirm?.disabled).toBe(true);
    expect(confirm?.querySelector("svg.spin")).not.toBeNull();
    expect(button("Keep my plan", "dialog")?.disabled).toBe(true);
    expect(net.cancels).toBe(1);

    release();
    await settle();
    expect(toasts.done).toEqual([{ title: "Pro is cancelled", body: `You keep it until ${periodEnd}, then move to Free.` }]);
    expect(toasts.failed).toEqual([]);
    expect(dialog()).toBeNull();
    expect(text(yourPlan())).toContain("Cancelled");
    expect(text(yourPlan())).toContain(`Ends on ${periodEnd}. You keep Pro until then, then move to Free.`);
    expect(button("Cancel plan")).toBeUndefined();
    // Pro's own column offers to keep it, never a second paid month beside the first.
    expect(button("Keep my plan")).toBeDefined();
    expect(button("Subscribe to Pro again")).toBeUndefined();
  });

  it("says why in a toast when it is refused, never in red on the page, and keeps the plan as it was", async () => {
    await draw();
    net.refuse = 503;
    await press("Cancel plan");
    await press("Cancel plan", "dialog");
    await settle();

    expect(toasts.failed.map((failure) => failure.title)).toEqual(["Couldn’t cancel Pro"]);
    expect(String(toasts.failed[0].detail)).toContain("Polar didn’t answer. Nothing was changed.");
    expect(toasts.done).toEqual([]);
    expect(dialog()).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(text(yourPlan())).toContain(`Renews on ${periodEnd}`);
    expect(button("Cancel plan")?.disabled).toBe(false);
  });
});
