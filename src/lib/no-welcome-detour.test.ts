import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The rule: outside the welcome flow, every "Telegram" or "Link" leads to Integrations, never to
// /onboarding, and every way to the apps leads to Integrations → Apps. Checked twice: in the code
// (nothing outside the flow builds an address to the flow's chat app step, or to /apps), and on the
// screens that have such a link, drawn from the demo backend's answers.

vi.mock("next/navigation", () => ({
  usePathname: () => "/more",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/providers", () => ({ useAppConfig: () => ({ mode: "demo", demo: true, clerk: false }) }));

import MorePage from "@/app/(app)/more/page";
import GeneralSettingsPage from "@/app/(app)/settings/page";
import { MobileTabBar } from "@/components/shell/mobile-nav";
import { qk } from "@/lib/api/hooks";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";

const SRC = join(__dirname, "..");
/** The welcome flow itself, which keeps its own Telegram step. */
const FLOW = [join("components", "onboarding") + sep, join("app", "onboarding") + sep];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

describe("in the code", () => {
  const files = sources(SRC).map((path) => ({ path: relative(SRC, path), code: readFileSync(path, "utf8") }));

  it("builds no address to the welcome flow's chat app step outside the flow", () => {
    const offenders = files
      .filter((file) => !FLOW.some((dir) => file.path.startsWith(dir)))
      .filter((file) => /step=chat|stepHref\(\s*["']chat["']|\/onboarding\?channel=/.test(file.code))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("leads to the apps only through Integrations; /apps is left to the redirect", () => {
    const offenders = files
      .filter((file) => file.path !== join("lib", "integrations.ts"))
      .filter((file) => /["'`]\/apps(?:[/?"'`])/.test(file.code))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}

/** A client holding what the demo backend answers for the screens drawn here. */
async function seeded(): Promise<QueryClient> {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.channels, await demo("channels"));
  qc.setQueryData(qk.agentSettings, await demo("agent/settings"));
  qc.setQueryData(qk.apps, await demo("apps"));
  qc.setQueryData(qk.automations, await demo("automations"));
  qc.setQueryData(qk.plans, await demo("billing/plans"));
  qc.setQueryData(qk.memories, await demo("memories"));
  qc.setQueryData(qk.crew, await demo("crew"));
  qc.setQueryData(qk.approvals("pending"), await demo("approvals?status=pending"));
  qc.setQueryData(qk.conversations, { pages: [await demo("conversations")], pageParams: [undefined] });
  return qc;
}

const draw = (qc: QueryClient, page: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, page));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));

describe("on the screens", () => {
  beforeEach(() => {
    // Someone who has just signed up: nothing linked, the checklist showing.
    resetDemoStore(new Date("2026-10-01T14:30:00"), "new");
  });

  it("Settings → Linked chats → Link leads to Integrations, with the code ready", async () => {
    const html = draw(await seeded(), createElement(GeneralSettingsPage));
    expect(html).toMatch(/<a [^>]*aria-label="Link Telegram"[^>]*href="\/integrations\?link=telegram"|<a [^>]*href="\/integrations\?link=telegram"[^>]*aria-label="Link Telegram"/);
    expect(hrefs(html).filter((href) => href.startsWith("/onboarding"))).toEqual([]);
    expect(hrefs(html)).toContain("/integrations");
  });

  it("the Getting started checklist's Link Telegram leads to Integrations, and Connect an app to its Apps tab", async () => {
    const html = draw(await seeded(), createElement(MorePage));
    expect(html).toContain("Getting started");
    expect(html).toMatch(/<a [^>]*href="\/integrations\?link=telegram"[^>]*aria-label="Link: Link Telegram"|<a [^>]*aria-label="Link: Link Telegram"[^>]*href="\/integrations\?link=telegram"/);
    expect(hrefs(html)).toContain("/integrations/apps");
    // Only the AI step may still open the welcome flow's own step (done here: Textcrew AI is on).
    expect(hrefs(html).filter((href) => href.startsWith("/onboarding") && href !== "/onboarding?step=ai")).toEqual([]);
  });

  it("More reaches Integrations, saying what is linked", async () => {
    const html = draw(await seeded(), createElement(MorePage));
    expect(html).toMatch(/<a [^>]*href="\/integrations"[^>]*>.*?Integrations<\/span>.*?No chat linked/);
  });

  it("the phone's tabs have Integrations, and nothing leads to /apps", async () => {
    const html = draw(await seeded(), createElement(MobileTabBar));
    expect(html).toMatch(/<a [^>]*href="\/integrations"[^>]*>.*?Integrations<\/a>/);
    expect(hrefs(html)).not.toContain("/apps");
  });
});
