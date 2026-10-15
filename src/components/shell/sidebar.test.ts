import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// What the browser remembers, and whether the page has been drawn once, as each test needs.
const state = vi.hoisted(() => ({
  collapsed: false,
  motion: true,
  balance: 1884,
  /** Whether the sidebar is on screen (it is drawn, but asks for nothing, on a phone). */
  wide: false,
  /** The account's `gettingStartedDismissedAt`; undefined is a backend that doesn't send it. */
  dismissedAt: undefined as string | null | undefined,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/approvals" }));
vi.mock("./providers", () => ({ useAppConfig: () => ({ mode: "clerk" }) }));
vi.mock("@/lib/stored-flag", async (original) => ({ ...(await original<typeof import("@/lib/stored-flag")>()), useStoredFlag: () => state.collapsed }));
vi.mock("@/lib/motion", async (original) => ({ ...(await original<typeof import("@/lib/motion")>()), useMotionReady: () => state.motion }));
vi.mock("@/lib/media-query", async (original) => ({ ...(await original<typeof import("@/lib/media-query")>()), useMediaQuery: () => state.wide }));
// A new account on a server with Textcrew AI off: no AI, nothing linked, nothing said. The
// checklist's data is there only for a hook that is allowed to ask.
const asked = <T>(enabled: boolean | { enabled?: boolean } | undefined, data: T) =>
  ({ data: (typeof enabled === "object" ? enabled.enabled : enabled) === false ? undefined : data });
vi.mock("@/lib/api/hooks", () => ({
  useAgentStatus: () => ({ data: { state: "awake", lastActiveAt: null } }),
  useApprovals: () => ({ data: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] }),
  useCrew: () => ({ data: undefined }),
  useMe: () => ({
    data: {
      id: "user_1",
      name: "Aarav Shah",
      email: "aarav@northwind.studio",
      plan: "pro",
      credits: { balance: state.balance, nextExpiry: null },
      ...(state.dismissedAt === undefined ? {} : { gettingStartedDismissedAt: state.dismissedAt }),
    },
  }),
  usePlans: () => ({ data: undefined }),
  useAgentSettings: (enabled?: boolean) => asked(enabled, { aiAccess: "none", platformAvailable: false, ownKeyProviders: [], claude: { connected: false } }),
  useChannelList: (enabled?: boolean) => asked(enabled, { items: [], available: ["telegram", "web"] }),
  useApps: (enabled?: boolean) => asked(enabled, []),
  useConversations: (enabled?: boolean) => asked(enabled, { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] }),
  useAutomations: (options?: { enabled?: boolean }) => asked(options, []),
  useUpdateOnboarding: () => ({ mutate: () => {} }),
}));

import { Sidebar } from "./sidebar";

const draw = () => renderToStaticMarkup(createElement(Sidebar));
const nav = (html: string) => /<nav[^>]*>/.exec(html)?.[0] ?? "";
const classes = (element: string) => (/class="([^"]*)"/.exec(element)?.[1] ?? "").replaceAll("&amp;", "&").split(" ");
const toggle = (html: string) => /<button[^>]*aria-label="(?:Collapse|Expand) sidebar"[^>]*>/.exec(html)?.[0] ?? "";
/** The opening tags of the links to `href`, in order. */
const links = (html: string, href: string) => (html.match(/<a [^>]*>/g) ?? []).filter((tag) => tag.includes(`href="${href}"`));
const link = (html: string, href: string) => links(html, href)[0] ?? "";
/** The credits tile on the rail: the link to the credits that has a name of its own. */
const tile = (html: string) => links(html, "/settings/credits").find((tag) => tag.includes("aria-label=")) ?? "";

beforeEach(() => {
  state.collapsed = false;
  state.motion = true;
  state.balance = 1884;
  state.wide = false;
  state.dismissedAt = undefined;
});

describe("Sidebar, open", () => {
  it("has a button at its top that folds it, saying so", () => {
    const html = draw();
    expect(toggle(html)).toContain('aria-label="Collapse sidebar"');
    expect(toggle(html)).toContain('aria-expanded="true"');
    expect(classes(nav(html))).toContain("w-[236px]");
    expect(nav(html)).not.toContain("data-collapsed");
  });

  it("leads to Integrations under Set up, where the apps, chat apps and MCP servers are; nothing leads to /apps", () => {
    const html = draw();
    expect(link(html, "/integrations")).not.toBe("");
    expect(html).toMatch(/<a [^>]*href="\/integrations"[^>]*>.*?>Integrations<\/span>/);
    expect(links(html, "/apps")).toEqual([]);
  });

  it("shows the words, and the credits card rather than the rail's tile", () => {
    const html = draw();
    expect(html).toContain(">Approvals</span>");
    // The tile is drawn, out of sight and out of reach, until the sidebar folds.
    expect(classes(tile(html))).toEqual(expect.arrayContaining(["invisible", "group-data-[collapsed]/nav:visible"]));
    expect(link(html, "/approvals")).not.toContain("title=");
  });

  it("leads to Help, after Settings", () => {
    const html = draw();
    expect(link(html, "/help")).not.toBe("");
    expect(html.indexOf('href="/help"')).toBeGreaterThan(html.indexOf('href="/settings"'));
    expect(html).toContain(">Help</span>");
  });
});

describe("Sidebar, folded to a rail of icons", () => {
  beforeEach(() => {
    state.collapsed = true;
  });

  it("is 60px wide and has the button that opens it again", () => {
    const html = draw();
    expect(nav(html)).toContain("data-collapsed");
    expect(classes(nav(html))).toContain("w-[60px]");
    expect(toggle(html)).toContain('aria-label="Expand sidebar"');
    expect(toggle(html)).toContain('aria-expanded="false"');
  });

  it("keeps each link named by its words, for screen readers, and says where it leads when pointed at", () => {
    const html = draw();
    const approvals = link(html, "/approvals");
    expect(approvals).toContain('title="Approvals"');
    expect(approvals).toContain('aria-current="page"');
    // The words are faded, not removed: they are still the link's name.
    expect(html).toMatch(/<span class="[^"]*group-data-\[collapsed\]\/nav:opacity-0[^"]*">Approvals<\/span>/);
    // The count of approvals waiting sits on the icon too, without being read twice.
    expect(html).toMatch(/<span aria-hidden="true" class="absolute[^"]*">3<\/span>/);
  });

  it("puts the balance in a tile that leads to the credits, red when it is low", () => {
    const html = draw();
    expect(tile(html)).toContain('aria-label="1,884 credits"');
    expect(tile(html)).toContain('title="1,884 credits"');
    expect(html).toContain(`${tile(html)}1.9K</a>`);
    expect(classes(tile(html))).not.toContain("text-danger");
    state.balance = 12;
    expect(tile(draw())).toContain('aria-label="12 credits"');
    expect(classes(tile(draw()))).toContain("text-danger");
  });

  it("hides the brand and the credits card from the keyboard and screen readers", () => {
    const html = draw();
    expect(html).toMatch(/<div class="[^"]*group-data-\[collapsed\]\/nav:invisible[^"]*"><a [^>]*aria-label="Textcrew, home"/);
    const card = links(html, "/settings/credits").find((tag) => !tag.includes("aria-label=")) ?? "";
    expect(card).not.toBe("");
    expect(html).toMatch(/<div class="min-w-\[216px\][^"]*group-data-\[collapsed\]\/nav:invisible[^"]*"><a class=[^>]*href="\/settings\/credits">/);
  });
});

describe("Sidebar, moving", () => {
  it("folds and opens over 225ms, never for someone who asked for less motion", () => {
    expect(classes(nav(draw()))).toEqual(expect.arrayContaining(["transition-[width]", "duration-[225ms]", "motion-reduce:transition-none"]));
    expect(draw()).toContain('data-motion="true"');
  });

  it("doesn't move until the page has been drawn once, so a remembered rail doesn't slide shut on every load", () => {
    state.motion = false;
    state.collapsed = true;
    const html = draw();
    expect(classes(nav(html))).not.toContain("transition-[width]");
    expect(nav(html)).not.toContain('data-motion="');
    // Everything inside is held still too, until then.
    expect(classes(nav(html))).toContain("[&:not([data-motion])_*]:transition-none");
  });
});

describe("Sidebar, getting started", () => {
  beforeEach(() => {
    state.wide = true;
    state.dismissedAt = null;
  });

  it("shows the checklist above the credits while what matters is left, with the next step", () => {
    const html = draw();
    expect(html).toContain("Getting started");
    // The AI, a first message, Telegram and an automation: no app can be connected here.
    expect(html).toContain("0 of 4");
    expect(html).toContain("Next: Connect your AI");
    expect(html.indexOf("Getting started")).toBeLessThan(html.indexOf('href="/settings/credits"'));
    // The whole list opens beside the sidebar, as a popover.
    expect(html).toMatch(/<div[^>]*popover="auto"[^>]*role="dialog"/);
    expect(html).toContain('href="/onboarding?step=ai"');
    // Linking Telegram happens in Integrations, never in the welcome flow.
    expect(html).toContain('href="/integrations?link=telegram"');
    expect(html).not.toContain("step=chat");
  });

  it("puts a ring with the count on the rail", () => {
    state.collapsed = true;
    expect(draw()).toContain('aria-label="Getting started, 0 of 4 done"');
  });

  it("has none once the account says it was hidden, on a backend that doesn't say, or on a phone", () => {
    state.dismissedAt = "2026-10-15T09:00:00.000Z";
    expect(draw()).not.toContain("Getting started");
    state.dismissedAt = undefined;
    expect(draw()).not.toContain("Getting started");
    state.dismissedAt = null;
    state.wide = false;
    expect(draw()).not.toContain("Getting started");
  });
});
