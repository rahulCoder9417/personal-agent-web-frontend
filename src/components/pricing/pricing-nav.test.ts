import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "@/test/app-routes";

// The ways to Pricing: Settings → Plans (its tab, and its old address), the page Polar returns to,
// More and the tabs on a phone. The sidebar's entry is tested with the sidebar.

const nav = vi.hoisted(() => ({ pathname: "/pricing" }));
const redirected = vi.hoisted(() => ({ to: null as string | null }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => {
    redirected.to = to;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/env", () => ({ authMode: () => "demo" }));
vi.mock("@/lib/api/hooks", () => ({
  useMe: () => ({ data: { id: "user_1", name: "Aarav Shah", email: "aarav@northwind.studio", plan: "pro", credits: { balance: 1884, nextExpiry: null } } }),
  usePlans: () => ({ data: { plans: [{ id: "pro", name: "Pro" }], topUps: [] } }),
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

import nextConfig from "../../../next.config";
import MorePage from "@/app/(app)/more/page";
import SettingsLayout from "@/app/(app)/settings/layout";
import BillingPage from "@/app/billing/page";
import { MobileTabBar } from "@/components/shell/mobile-nav";
import { PRICING_PATH } from "@/lib/pricing";

/** The opening tags of the links to `href`. */
const linksTo = (html: string, href: string) => (html.match(/<a [^>]*>/g) ?? []).filter((tag) => tag.includes(`href="${href}"`));

beforeEach(() => {
  nav.pathname = "/pricing";
  redirected.to = null;
});

describe("Settings → Plans", () => {
  it("is still a section of Settings, and leads to Pricing", () => {
    nav.pathname = "/settings";
    const html = renderToStaticMarkup(createElement(SettingsLayout, null, createElement("p", null, "page")));
    // The column of sections and the tabs under the title.
    expect(html.match(/<a [^>]*href="\/pricing"[^>]*>Plans<\/a>/g)).toHaveLength(2);
    expect(linksTo(html, "/settings/plans")).toEqual([]);
  });

  it("has no page of its own left: its old address is redirected to Pricing, with the query as it was", async () => {
    expect(PRICING_PATH).toBe("/pricing");
    expect(appRoutes().has("/pricing")).toBe(true);
    expect(appRoutes().has("/settings/plans")).toBe(false);
    // Next.js passes the query on (`/settings/plans?checkout=done`) by itself. Temporary, so no browser keeps it.
    expect(await nextConfig.redirects?.()).toContainEqual({ source: "/settings/plans", destination: "/pricing", permanent: false });
  });

  it("is where nothing in the app links to any more", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !path.endsWith(join("lib", "pricing.ts"))) {
          if (readFileSync(path, "utf8").includes("/settings/plans")) found.push(path);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(found).toEqual([]);
  });
});

describe("Coming back from Polar", () => {
  it("lands on Pricing, which watches for the payment, and on Pricing without a checkout", async () => {
    const visit = (query: Record<string, string>) => BillingPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) });
    await expect(visit({ checkout: "done" })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirected.to).toBe("/pricing?checkout=done");
    await expect(visit({})).rejects.toThrow("NEXT_REDIRECT");
    expect(redirected.to).toBe("/pricing");
  });
});

describe("Pricing on a phone", () => {
  it("is a row of More, with the plan's name, in place of Plans and billing", () => {
    const html = renderToStaticMarkup(createElement(MorePage));
    expect(linksTo(html, "/pricing")).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/pricing"[^>]*>[\s\S]*?>Pricing<\/span>[\s\S]*?>Pro<\/span>/);
    expect(html).not.toContain("Plans and billing");
  });

  it("keeps More lit while it is open, and no other tab", () => {
    const html = renderToStaticMarkup(createElement(MobileTabBar));
    expect(linksTo(html, "/more")[0]).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
