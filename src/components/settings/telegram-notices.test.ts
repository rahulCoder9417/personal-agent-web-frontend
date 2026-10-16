// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Settings → General, "Tell me on Telegram when…": shown once Telegram is linked, three switches
// and quiet hours, each change saved at once and said in a toast, and put back when the backend
// says no. The requests go to the demo backend, which answers as the real one would.

const net = vi.hoisted(() => {
  const state = {
    handle: null as null | ((request: Request) => Promise<Response>),
    /** Answer the next PATCH with this status instead. */
    refuse: null as null | number,
    patches: [] as unknown[],
  };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    if (request.method === "PATCH") {
      state.patches.push(await request.clone().json());
      if (state.refuse) return Response.json({ error: { code: "internal", message: "Something broke." } }, { status: state.refuse });
    }
    return state.handle!(request);
  };
  return state;
});

const toasts = vi.hoisted(() => ({ done: [] as { title: string }[], failed: [] as { title: string }[] }));
vi.mock("@/components/toast", () => ({
  toast: (message: { title: string }) => toasts.done.push(message),
  toastError: (title: string) => toasts.failed.push({ title }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/providers", () => ({ useAppConfig: () => ({ mode: "demo", demo: true, clerk: false }) }));

import GeneralSettingsPage from "@/app/(app)/settings/page";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { changeToast, clockOptions, DEFAULT_NOTIFICATIONS, withNotificationChange } from "@/lib/notifications";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let demo: ReturnType<typeof resetDemoStore>;

beforeEach(() => {
  demo = resetDemoStore(new Date("2026-10-01T14:30:00"));
  net.handle = (request) => handleDemoRequest(request, new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/"));
  net.refuse = null;
  net.patches = [];
  toasts.done = [];
  toasts.failed = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(GeneralSettingsPage))));
  await settle();
}

const group = () => [...host.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Tell me on Telegram when…");
const switchFor = (name: string) => [...host.querySelectorAll('button[role="switch"]')].find((b) => b.getAttribute("aria-label") === name);
const isOn = (name: string) => switchFor(name)?.getAttribute("aria-checked") === "true";

async function flip(name: string) {
  const target = switchFor(name);
  if (!target) throw new Error(`no switch "${name}"`);
  await act(async () => (target as HTMLButtonElement).click());
  await settle();
}

describe("Tell me on Telegram when…", () => {
  it("shows three switches and quiet hours once Telegram is linked, as they start", async () => {
    await draw();
    expect(group()?.id).toBe("telegram-notices");
    expect(isOn("Byte or Patch finishes a job")).toBe(true);
    expect(isOn("Pull-request reviews finish")).toBe(true);
    expect(isOn("Automation runs finish")).toBe(false);
    expect(isOn("Quiet hours")).toBe(true);
    const words = group()?.textContent ?? "";
    expect(words).toContain("Always in addition to the chat you asked in, never instead.");
    expect(words).toContain("In your time zone (Asia/Kolkata)");
    expect(words).toContain("10:00 PM to 8:00 AM, over midnight.");
  });

  it("is not there before Telegram is linked", async () => {
    demo.channels = [];
    await draw();
    expect(host.textContent).toContain("Linked chats");
    expect(group()).toBeUndefined();
  });

  it("saves a switch at once and says so", async () => {
    await draw();
    await flip("Automation runs finish");
    expect(net.patches).toEqual([{ notifications: { automationRuns: true } }]);
    expect(isOn("Automation runs finish")).toBe(true);
    expect(toasts.done).toEqual([{ title: "Automation runs finish: on" }]);
    expect(demo.user.notifications.automationRuns).toBe(true);
  });

  it("switching quiet hours off hides the times", async () => {
    await draw();
    expect(group()?.textContent).toContain("Between");
    await flip("Quiet hours");
    expect(net.patches).toEqual([{ notifications: { quietHours: { enabled: false } } }]);
    expect(group()?.textContent).not.toContain("Between");
    expect(toasts.done).toEqual([{ title: "Quiet hours off" }]);
  });

  it("puts a refused change back and says it wasn’t saved", async () => {
    net.refuse = 500;
    await draw();
    await flip("Byte or Patch finishes a job");
    expect(isOn("Byte or Patch finishes a job")).toBe(true);
    expect(toasts.failed).toEqual([{ title: "Couldn’t save that" }]);
    expect(toasts.done).toEqual([]);
  });
});

describe("the settings' own rules", () => {
  it("change only what is named", () => {
    expect(withNotificationChange(DEFAULT_NOTIFICATIONS, { quietHours: { start: "23:00" } })).toEqual({
      ...DEFAULT_NOTIFICATIONS,
      quietHours: { enabled: true, start: "23:00", end: "08:00" },
    });
    expect(withNotificationChange(DEFAULT_NOTIFICATIONS, { prReviews: false }).prReviews).toBe(false);
  });

  it("offer every half hour, and a saved time in between", () => {
    expect(clockOptions("22:00")).toHaveLength(48);
    expect(clockOptions("22:15").map((o) => o.value)).toContain("22:15");
    expect(clockOptions("00:00")[0]).toEqual({ value: "00:00", label: "12:00 AM" });
  });

  it("say each change in plain words", () => {
    expect(changeToast({ crewJobs: false }, DEFAULT_NOTIFICATIONS)).toBe("Byte or Patch finishes a job: off");
    expect(changeToast({ quietHours: { end: "07:30" } }, withNotificationChange(DEFAULT_NOTIFICATIONS, { quietHours: { end: "07:30" } }))).toBe(
      "Quiet hours: 10:00 PM to 7:30 AM",
    );
  });

  it("the demo backend refuses quiet hours that start when they end, as the real one does", async () => {
    const response = await handleDemoRequest(
      new Request("http://localhost/api/v1/me", { method: "PATCH", body: JSON.stringify({ notifications: { quietHours: { end: "22:00" } } }) }),
      ["me"],
    );
    expect(response.status).toBe(400);
  });
});
