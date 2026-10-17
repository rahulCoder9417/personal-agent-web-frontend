import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The crew has no screen of its own: what it is lives in Help (the "crew" section), and Byte and
// Patch are asked for in the chat. Checked in the code (no address to /crew or to the crew jobs is
// left, and no page), at the old address (it leads to Help's crew section), and on the screens
// that used to lead there (More, the phone's tabs, pull-request review's canvas).

vi.mock("next/navigation", () => ({
  usePathname: () => "/more",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/providers", () => ({ useAppConfig: () => ({ mode: "demo", demo: true, clerk: false }) }));

import nextConfig from "../../next.config";
import MorePage from "@/app/(app)/more/page";
import { ReviewBuilder } from "@/components/automations/review-builder";
import { MobileTabBar } from "@/components/shell/mobile-nav";
import type { CrewMember } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { CREW_EXAMPLES } from "@/lib/crew";
import { CREW_HELP_PATH, OLD_CREW_ADDRESSES } from "@/lib/crew-address";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { CREW_SECTION_ID, HELP_SECTIONS } from "@/lib/help-content";
import { appRoutes, pathOf } from "@/test/app-routes";

const SRC = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

describe("in the code", () => {
  const files = sources(SRC).map((path) => ({ path: relative(SRC, path), code: readFileSync(path, "utf8") }));
  const offenders = (pattern: RegExp, allowed: readonly string[] = []) =>
    files.filter((file) => !allowed.includes(file.path) && pattern.test(file.code)).map((file) => file.path);

  it("has no Crew page", () => {
    expect([...appRoutes()].filter((route) => route === "/crew" || route.startsWith("/crew/"))).toEqual([]);
  });

  it("leads nowhere to /crew; only the redirect names it", () => {
    expect(offenders(/["'`]\/crew(?:[/?#"'`])/, [join("lib", "crew-address.ts")])).toEqual([]);
  });

  it("has no crew jobs screen, form or list left: Byte and Patch are asked for in the chat", () => {
    expect(offenders(/Give (Patch a review|Byte a job|the crew a job)|CrewJobsSection|useCrewJobs|useCreateCrewJob/)).toEqual([]);
    // The API's crew jobs are no longer asked for (the proxy still lets them through: they are the
    // backend's user-facing paths).
    expect(offenders(/\/v1\/crew-jobs|["'`]crew-jobs["'`]/, [join("lib", "api", "proxy-target.ts")])).toEqual([]);
    // The repo list is asked for only by the pull-request review picker.
    expect(offenders(/useGithubRepos|\/v1\/github\/repos/, [join("lib", "api", "proxy-target.ts"), join("lib", "api", "hooks.ts"), join("components", "automations", "review-builder.tsx")])).toEqual([]);
  });
});

describe("the old address", () => {
  it("leads to the crew's part of Help, as a temporary redirect", async () => {
    expect(OLD_CREW_ADDRESSES).toEqual([{ source: "/crew", destination: "/help#crew", permanent: false }]);
    expect(await nextConfig.redirects?.()).toEqual(expect.arrayContaining([{ source: "/crew", destination: CREW_HELP_PATH, permanent: false }]));
  });

  it("lands on a page the app has, at a part of Help that is there", () => {
    expect(appRoutes()).toContain(pathOf(CREW_HELP_PATH));
    expect(CREW_HELP_PATH.split("#")[1]).toBe(CREW_SECTION_ID);
    const crew = HELP_SECTIONS.find((section) => section.id === CREW_SECTION_ID);
    expect(crew?.title).toBe("The crew");
    // Who is on it, and how to ask Byte and Patch in the chat.
    expect(crew?.topics.map((topic) => topic.id)).toEqual(expect.arrayContaining(["crew-who", "crew-byte", "crew-patch", "crew-auto-review"]));
  });
});

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}

async function seeded(crew?: (members: CrewMember[]) => CrewMember[]): Promise<QueryClient> {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.channels, await demo("channels"));
  qc.setQueryData(qk.agentSettings, await demo("agent/settings"));
  qc.setQueryData(qk.apps, await demo("apps"));
  qc.setQueryData(qk.automations, await demo("automations"));
  qc.setQueryData(qk.plans, await demo("billing/plans"));
  qc.setQueryData(qk.memories, await demo("memories"));
  qc.setQueryData(qk.prReviews, await demo("pr-reviews"));
  const list = await demo<{ items: CrewMember[] }>("crew");
  qc.setQueryData(qk.crew, { items: crew ? crew(list.items) : list.items });
  qc.setQueryData(qk.approvals("pending"), await demo("approvals?status=pending"));
  qc.setQueryData(qk.conversations, { pages: [await demo("conversations")], pageParams: [undefined] });
  return qc;
}

const draw = (qc: QueryClient, page: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, page));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));

describe("on the screens", () => {
  beforeEach(() => {
    resetDemoStore(new Date("2026-10-01T14:30:00"));
  });

  it("More has no Crew row; Help is still there", async () => {
    const html = draw(await seeded(), createElement(MorePage));
    expect(hrefs(html).filter((href) => href.startsWith("/crew"))).toEqual([]);
    expect(html).not.toContain(">Crew</span>");
    expect(hrefs(html)).toContain("/help");
  });

  it("the phone's tabs don't claim /crew", async () => {
    const html = draw(await seeded(), createElement(MobileTabBar));
    expect(html).not.toContain("/crew");
  });

  it("Pull-request review offers one review from the chat, and leads to Help when Patch isn't on the crew here", async () => {
    const on = draw(await seeded(), createElement(ReviewBuilder, { automation: null }));
    expect(on).toContain("Just one pull request?");
    expect(hrefs(on)).toContain(`/?draft=${encodeURIComponent(CREW_EXAMPLES.patch)}`);
    expect(hrefs(on).filter((href) => href.startsWith("/crew"))).toEqual([]);

    const asleep = draw(await seeded((members) => members.map((m) => (m.id === "patch" ? { ...m, available: false } : m))), createElement(ReviewBuilder, { automation: null }));
    expect(asleep).toContain("Patch isn’t on the crew here yet");
    expect(hrefs(asleep)).toContain(CREW_HELP_PATH);
    expect(hrefs(asleep).filter((href) => href.startsWith("/crew"))).toEqual([]);
  });
});
