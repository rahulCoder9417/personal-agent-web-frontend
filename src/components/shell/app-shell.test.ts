import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The page the app is on, and what `GET /v1/me` has said so far, as each test needs.
const state = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  me: {
    data: undefined as { onboardingCompletedAt?: string | null } | undefined,
    isError: false,
    error: null as unknown,
    fetchStatus: "fetching" as "fetching" | "idle",
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ replace: () => {}, push: () => {}, prefetch: () => {} }),
}));
vi.mock("@/lib/api/hooks", () => ({ useMe: () => ({ ...state.me, refetch: () => {} }) }));
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
/** Anything of the app: its sidebar, its bars, or the page in it. */
const appShows = (html: string) => ["[sidebar]", "[top bar]", "[tab bar]", "[the chat]"].some((part) => html.includes(part));
const spinner = (html: string) => /<p role="status"[^>]*>.*Loading<\/span><\/p>/.test(html);

const loading = () => (state.me = { data: undefined, isError: false, error: null, fetchStatus: "fetching" });
const loaded = (onboardingCompletedAt: string | null | undefined) =>
  (state.me = {
    data: onboardingCompletedAt === undefined ? {} : { onboardingCompletedAt },
    isError: false,
    error: null,
    fetchStatus: "idle",
  });

beforeEach(() => {
  state.pathname = "/";
  state.search = "";
  loading();
  welcomeLeft.clear();
});

describe("the chat, for someone who may not have seen the welcome flow", () => {
  it("draws nothing of the app while the account is on its way, only a spinner", () => {
    // The founder's sign-up: the sidebar and the chat were on screen until GET /v1/me came back.
    const html = draw();
    expect(appShows(html)).toBe(false);
    expect(spinner(html)).toBe(true);
  });

  it("draws nothing of the app for a new account either: it is on its way to the flow", () => {
    loaded(null);
    const html = draw();
    expect(appShows(html)).toBe(false);
    expect(spinner(html)).toBe(true);
  });

  it("draws the app once the account says the flow was finished or skipped", () => {
    loaded("2026-10-15T12:12:38.000Z");
    const html = draw();
    for (const part of ["[sidebar]", "[top bar]", "[tab bar]", "[the chat]"]) expect(html).toContain(part);
    expect(spinner(html)).toBe(false);
  });

  it("draws the app on a backend that doesn't keep the mark", () => {
    loaded(undefined);
    expect(appShows(draw())).toBe(true);
  });

  it("draws the app at once after the flow was left in this visit, even before the account is back", () => {
    welcomeLeft.mark();
    expect(appShows(draw())).toBe(true);
    loaded(null);
    expect(appShows(draw())).toBe(true);
  });

  it("says the account didn't load, with Try again, instead of the app", () => {
    state.me = { data: undefined, isError: true, error: new ApiError(503, "unavailable", "The server is busy."), fetchStatus: "idle" };
    const html = draw();
    expect(appShows(html)).toBe(false);
    expect(html).toContain("That didn’t load");
    expect(html).toContain("The server is busy.");
    expect(html).toContain("Try again");
  });

  it("goes back to the spinner while Try again is on its way", () => {
    state.me = { data: undefined, isError: true, error: new ApiError(503, "unavailable", "The server is busy."), fetchStatus: "fetching" };
    const html = draw();
    expect(html).not.toContain("That didn’t load");
    expect(spinner(html)).toBe(true);
  });
});

describe("the other pages", () => {
  it("draw at once, without waiting for the account", () => {
    state.pathname = "/settings";
    const html = draw();
    expect(appShows(html)).toBe(true);
    expect(spinner(html)).toBe(false);
  });

  it("aren't held for the flow either: only opening the chat leads to it", () => {
    state.pathname = "/apps";
    loaded(null);
    expect(appShows(draw())).toBe(true);
  });
});
