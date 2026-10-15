// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Disconnecting an app and unlinking a chat app, clicked through in a browser-like page: the row's
// button, the confirm dialog, the work under way, and what is said and shown afterwards. The
// requests go to the demo backend, which answers as the real one would.

// The pages' requests, handed to the demo backend. `openapi-fetch` keeps the `fetch` it finds when
// the client is made, so this is in place before anything is imported.
const net = vi.hoisted(() => {
  const state = {
    handle: null as null | ((request: Request) => Promise<Response>),
    /** While set, a removal waits for it before it is answered. */
    hold: null as null | Promise<void>,
    /** Answer removals with this status instead. */
    refuse: null as null | number,
    removals: [] as string[],
  };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    if (request.method === "DELETE") {
      state.removals.push(new URL(request.url).pathname);
      if (state.hold) await state.hold;
      if (state.refuse) return Response.json({ error: { code: "internal", message: "Composio is down right now." } }, { status: state.refuse });
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
  usePathname: () => "/integrations",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import AppsPage from "@/app/(app)/integrations/apps/page";
import { ChatAppsTab } from "@/components/integrations/chat-apps";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  resetDemoStore(new Date("2026-10-01T14:30:00"));
  net.handle = (request) => handleDemoRequest(request, new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/"));
  net.hold = null;
  net.refuse = null;
  net.removals = [];
  toasts.done = [];
  toasts.failed = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** Lets the requests and the renders they cause finish. */
async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function draw(page: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => root.render(createElement(QueryClientProvider, { client }, page)));
  await settle();
}

const button = (name: string) => [...host.ownerDocument.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
const dialog = () => host.querySelector("dialog");
const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ");

async function press(name: string) {
  const target = button(name);
  if (!target) throw new Error(`no button "${name}"`);
  await act(async () => target.click());
  await settle(2);
}

describe("Disconnecting an app", () => {
  it("gives each account of an app its own Disconnect, a real button", async () => {
    await draw(createElement(AppsPage));
    for (const name of ["Disconnect Gmail aarav@northwind.studio", "Disconnect Gmail aarav.shah@gmail.com", "Disconnect GitHub aarav-shah"]) {
      const target = button(name);
      expect(target?.tagName).toBe("BUTTON");
      expect(target?.className).toContain("h-[30px]");
    }
  });

  it("asks first, naming the app and the account, what stops and the automations that watch it; Cancel changes nothing", async () => {
    await draw(createElement(AppsPage));
    await press("Disconnect GitHub aarav-shah");

    const open = dialog();
    expect(open?.open).toBe(true);
    expect(open?.getAttribute("role")).toBe("alertdialog");
    expect(text(open)).toContain("Disconnect GitHub (aarav-shah)?");
    expect(text(open)).toContain("Tex can no longer read or do anything in GitHub");
    expect(text(open)).toContain("These automations watch GitHub and stop with it:");
    expect(text(open)).toContain("Review pull requests in northwind/website");
    // The keyboard starts on Cancel, so Enter doesn't remove anything.
    expect(host.ownerDocument.activeElement?.textContent).toBe("Cancel");

    await press("Cancel");
    expect(dialog()).toBeNull();
    expect(net.removals).toEqual([]);
    expect(button("Disconnect GitHub aarav-shah")).toBeDefined();
  });

  it("shows the work under way, then says it is done and offers Connect again, without a reload", async () => {
    await draw(createElement(AppsPage));
    await press("Disconnect GitHub aarav-shah");

    let release!: () => void;
    net.hold = new Promise((resolve) => (release = resolve));
    await press("Disconnect GitHub");

    const confirm = button("Disconnect GitHub");
    expect(confirm?.disabled).toBe(true);
    expect(confirm?.querySelector("svg.spin")).not.toBeNull();
    expect(button("Cancel")?.disabled).toBe(true);
    // The row's own button says so too.
    expect(button("Disconnect GitHub aarav-shah")?.disabled).toBe(true);
    expect(net.removals).toEqual(["/api/v1/connections/con_github_1"]);

    release();
    await settle();
    expect(toasts.done).toEqual([{ title: "GitHub disconnected", body: "aarav-shah is no longer connected to Tex." }]);
    expect(toasts.failed).toEqual([]);
    expect(dialog()).toBeNull();
    expect(button("Disconnect GitHub aarav-shah")).toBeUndefined();
    expect(button("Connect GitHub")).toBeDefined();
  });

  it("says why in a toast when it is refused, never in red under the row, and leaves the account there", async () => {
    await draw(createElement(AppsPage));
    net.refuse = 503;
    await press("Disconnect Notion Northwind workspace");
    await press("Disconnect Notion");
    await settle();

    expect(toasts.failed.map((failure) => failure.title)).toEqual(["Couldn’t disconnect Notion"]);
    expect(String((toasts.failed[0].detail as Error).message)).toContain("Composio is down right now.");
    expect(toasts.done).toEqual([]);
    expect(dialog()).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(button("Disconnect Notion Northwind workspace")?.disabled).toBe(false);
  });

  it("with another account of the app left, says Tex goes on with it and lists no automations", async () => {
    await draw(createElement(AppsPage));
    await press("Disconnect Gmail aarav.shah@gmail.com");
    expect(text(dialog())).toContain("Disconnect Gmail (aarav.shah@gmail.com)?");
    expect(text(dialog())).toContain("goes on with your other Gmail account (aarav@northwind.studio)");
    expect(text(dialog())).not.toContain("automations watch");

    await press("Disconnect Gmail");
    await settle();
    expect(toasts.done.map((done) => done.title)).toEqual(["Gmail disconnected"]);
    expect(button("Disconnect Gmail aarav.shah@gmail.com")).toBeUndefined();
    expect(button("Disconnect Gmail aarav@northwind.studio")).toBeDefined();
  });
});

describe("Unlinking Telegram", () => {
  it("shows the linked chat, asks first in the same dialog, then says so and offers the one-time code again", async () => {
    await draw(createElement(ChatAppsTab));
    expect(text(host)).toContain("@aarav_s");
    expect(button("Get my Telegram code")).toBeUndefined();

    await press("Unlink Telegram @aarav_s");
    expect(dialog()?.open).toBe(true);
    expect(text(dialog())).toContain("Unlink Telegram (@aarav_s)?");
    expect(text(dialog())).toContain("Tex stops reading and answering this chat");

    await press("Unlink Telegram");
    await settle();
    expect(net.removals).toEqual(["/api/v1/channels/ch_telegram"]);
    expect(toasts.done.map((done) => done.title)).toEqual(["Telegram unlinked"]);
    expect(dialog()).toBeNull();
    expect(button("Unlink Telegram @aarav_s")).toBeUndefined();
    expect(button("Get my Telegram code")).toBeDefined();
  });

  it("says why in a toast when unlinking is refused, and keeps the chat", async () => {
    await draw(createElement(ChatAppsTab));
    net.refuse = 500;
    await press("Unlink Telegram @aarav_s");
    await press("Unlink Telegram");
    await settle();
    expect(toasts.failed.map((failure) => failure.title)).toEqual(["Couldn’t unlink Telegram"]);
    expect(dialog()).toBeNull();
    expect(button("Unlink Telegram @aarav_s")).toBeDefined();
  });
});
