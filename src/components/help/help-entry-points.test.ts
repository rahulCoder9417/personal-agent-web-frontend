import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistItem } from "@/lib/onboarding";

// Where Help can be opened from, besides the sidebar (tested with the sidebar): More on a phone,
// the phone's tabs, Settings, the "Getting started" checklist and the welcome flow's last step.

const nav = vi.hoisted(() => ({ pathname: "/help" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/hooks", () => ({
  useMe: () => ({ data: undefined }),
  usePlans: () => ({ data: undefined }),
  useChannels: () => ({ data: undefined }),
  useChannelList: () => ({ data: undefined }),
  useAgentSettings: () => ({ data: undefined }),
  useApps: () => ({ data: undefined }),
  useAutomations: () => ({ data: undefined }),
  useConversations: () => ({ data: undefined }),
  useCrew: () => ({ data: undefined }),
  useMemories: () => ({ data: undefined }),
  useApprovals: () => ({ data: [] }),
  useUpdateOnboarding: () => ({ mutate: () => {} }),
}));

import MorePage from "@/app/(app)/more/page";
import { GettingStartedCard } from "@/components/onboarding/getting-started";
import { StepHi } from "@/components/onboarding/step-hi";
import { HelpSection } from "@/components/settings/general-help";
import { MobileTabBar } from "@/components/shell/mobile-nav";

const draw = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
/** The opening tags of the links to `href`. */
const linksTo = (html: string, href: string) => (html.match(/<a [^>]*>/g) ?? []).filter((tag) => tag.includes(`href="${href}"`));

beforeEach(() => {
  nav.pathname = "/help";
});

describe("Help, on a phone", () => {
  it("is a row of More", () => {
    const html = draw(createElement(MorePage));
    expect(linksTo(html, "/help")).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/help"[^>]*>[\s\S]*?>Help<\/span>/);
  });

  it("keeps More lit while it is open, as for the other pages under More", () => {
    const more = () => linksTo(draw(createElement(MobileTabBar)), "/more")[0];
    expect(more()).toContain('aria-current="page"');
    nav.pathname = "/approvals";
    expect(more()).not.toContain("aria-current");
    // Only More: no other tab claims Help.
    nav.pathname = "/help";
    expect(draw(createElement(MobileTabBar)).match(/aria-current="page"/g)).toHaveLength(1);
  });
});

describe("Help, from Settings", () => {
  it("has a group of its own on General, leading to the page", () => {
    const html = draw(createElement(HelpSection));
    expect(html).toContain('<section id="help"');
    expect(html).toContain(">Help</h2>");
    expect(linksTo(html, "/help")).toHaveLength(1);
    expect(html).toContain("Open Help");
  });
});

describe("Help, from getting started", () => {
  const item: ChecklistItem = {
    id: "ai",
    title: "Connect your AI",
    body: "Tex can’t answer without one.",
    done: false,
    optional: false,
    doneNote: "",
    href: "/onboarding?step=ai",
    action: "Connect",
  };

  it("is at the foot of the checklist", () => {
    const html = draw(createElement(GettingStartedCard, { setup: { items: [item], visible: true, hide: () => {} } }));
    expect(linksTo(html, "/help")).toHaveLength(1);
    expect(html).toContain(">How Textcrew works</a>");
  });

  it("is offered on the welcome flow's last step", () => {
    const html = draw(createElement(StepHi, { me: undefined, settings: undefined, channels: undefined, apps: undefined, onStep: () => {}, onLeave: () => {} }));
    expect(linksTo(html, "/help")).toHaveLength(1);
    expect(html).toContain(">See how it works</a>");
  });
});
