import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The page the app is on, what `GET /v1/me` has said so far, and whether this browser remembers
// the account finishing the welcome flow, as each test needs.
const state = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  remembered: false,
  me: {
    data: undefined as { onboardingCompletedAt?: string | null } | undefined,
    isError: false,
    isFetching: true,
    error: null as unknown,
    fetchStatus: "fetching" as "fetching" | "idle",
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ replace: () => {}, push: () => {}, prefetch: () => {} }),
}));
vi.mock("./providers", () => ({ useAppConfig: () => ({ mode: "clerk", demo: false, clerk: true }) }));
vi.mock("@/lib/api/hooks", () => ({ useMe: () => ({ ...state.me, refetch: () => {} }) }));
vi.mock("@/lib/use-onboarded-here", () => ({ useOnboardedHere: () => state.remembered }));
vi.mock("@/lib/onboarded-here", () => ({ rememberOnboarded: () => {} }));
// The app around the page, drawn as a word each, so a test can see whether it is there.
vi.mock("@/lib/api/stream", () => ({ useEventStream: () => {} }));
vi.mock("./sidebar", () => ({ Sidebar: () => "[sidebar]" }));
vi.mock("./mobile-nav", () => ({ MobileTopBar: () => "[top bar]", MobileTabBar: () => "[tab bar]" }));
vi.mock("../browser-timezone", () => ({ BrowserTimezone: () => null }));
vi.mock("../checkout-watcher", () => ({ CheckoutWatcher: () => null }));

import { ApiError } from "@/lib/api/client";
import { welcomeLeft } from "@/lib/onboarding";
import { AppShell } from "./app-shell";

const draw = () => renderToStaticMarkup(createElement(AppShell, null, "[the chat]"));
const APP = ["[sidebar]", "[top bar]", "[tab bar]", "[the chat]"];
/** The app is drawn (so its requests go out), whether or not it can be seen. */
const appDrawn = (html: string) => APP.every((part) => html.includes(part));
/** Something covers the whole window, so nothing of the app can be seen. */
const covered = (html: string) => /<div class="fixed inset-0 z-\[100\][^"]*bg-bg/.test(html);
const spinner = (html: string) => /<p role="status"[^>]*>.*Loading<\/span><\/p>/.test(html);

const loading = () => (state.me = { data: undefined, isError: false, isFetching: true, error: null, fetchStatus: "fetching" });
const loaded = (onboardingCompletedAt: string | null | undefined) =>
  (state.me = {
    data: onboardingCompletedAt === undefined ? {} : { onboardingCompletedAt },
    isError: false,
    isFetching: false,
    error: null,
    fetchStatus: "idle",
  });
const failed = (fetchStatus: "fetching" | "idle" = "idle") =>
  (state.me = {
    data: undefined,
    isError: true,
    isFetching: fetchStatus === "fetching",
    error: new ApiError(503, "unavailable", "The server is busy."),
    fetchStatus,
  });

beforeEach(() => {
  state.pathname = "/";
  state.search = "";
  state.remembered = false;
  loading();
  welcomeLeft.clear();
});

describe("the chat, on a browser that doesn't remember this account finishing the flow", () => {
  it("covers the window with a spinner while the account is on its way, with the app drawn underneath", () => {
    // The founder's sign-up: the sidebar and the chat were on screen until GET /v1/me came back.
    const html = draw();
    expect(covered(html)).toBe(true);
    expect(spinner(html)).toBe(true);
    // Drawn, so the chats, the crew and the approvals are asked for alongside the account.
    expect(appDrawn(html)).toBe(true);
  });

  it("puts the cover ahead of the app in the page, so none of the app can show before it arrives", () => {
    const html = draw();
    expect(html.indexOf("fixed inset-0 z-[100]")).toBeGreaterThan(-1);
    expect(html.indexOf("fixed inset-0 z-[100]")).toBeLessThan(html.indexOf("[top bar]"));
    // The spinner's cover is the one hidden before the first paint where the browser remembers the account.
    expect(html).toMatch(/<div class="fixed inset-0 z-\[100\][^"]*welcome-cover"/);
  });

  it("keeps it covered for a new account: it is on its way to the flow", () => {
    loaded(null);
    expect(covered(draw())).toBe(true);
  });

  it("uncovers the app once the account says the flow was finished or skipped", () => {
    loaded("2026-10-15T12:12:38.000Z");
    const html = draw();
    expect(covered(html)).toBe(false);
    expect(appDrawn(html)).toBe(true);
  });

  it("shows the app on a backend that doesn't keep the mark", () => {
    loaded(undefined);
    expect(covered(draw())).toBe(false);
  });

  it("shows the app at once after the flow was left in this visit, even before the account is back", () => {
    welcomeLeft.mark();
    expect(covered(draw())).toBe(false);
    loaded(null);
    expect(covered(draw())).toBe(false);
  });

  it("says the account didn't load, with Try again, and doesn't keep the app drawn", () => {
    failed();
    const html = draw();
    expect(covered(html)).toBe(true);
    expect(html).toContain("That didn’t load");
    expect(html).toContain("The server is busy.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("welcome-cover");
    expect(APP.some((part) => html.includes(part))).toBe(false);
  });

  it("goes back to the spinner while Try again is on its way", () => {
    failed("fetching");
    const html = draw();
    expect(html).not.toContain("That didn’t load");
    expect(spinner(html)).toBe(true);
  });
});

describe("the chat, on a browser that remembers this account finishing the flow", () => {
  beforeEach(() => {
    state.remembered = true;
  });

  it("shows the app at once, while the account is still on its way", () => {
    const html = draw();
    expect(covered(html)).toBe(false);
    expect(spinner(html)).toBe(false);
    expect(appDrawn(html)).toBe(true);
  });

  it("shows the app, as before, when the account doesn't load", () => {
    failed();
    expect(covered(draw())).toBe(false);
  });

  it("covers it and goes to the flow when the account says it isn't done after all (an admin reset)", () => {
    loaded(null);
    expect(covered(draw())).toBe(true);
  });
});

describe("the other pages", () => {
  it("show at once, without waiting for the account", () => {
    state.pathname = "/settings";
    const html = draw();
    expect(covered(html)).toBe(false);
    expect(appDrawn(html)).toBe(true);
  });

  it("aren't held for the flow either: only opening the chat leads to it", () => {
    state.pathname = "/apps";
    loaded(null);
    expect(covered(draw())).toBe(false);
  });
});
