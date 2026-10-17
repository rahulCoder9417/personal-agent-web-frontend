import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Automations screen (`/automations`), drawn from the demo backend's answers: the title with
// one line of how they stand, what needs the person in amber, the drafts waiting, every automation
// as a row (pull-request review included, its repo as a chip), the filters and the templates.

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import AutomationsPage from "@/app/(app)/automations/page";
import { TEMPLATE_CARD, TEMPLATE_GRID } from "@/components/automations/templates";
import { GUTTER } from "@/components/page";
import type { App, Automation, AutomationRun } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { getStore } from "@/lib/demo/store";
import { appRoutes, pathOf } from "@/test/app-routes";

const NOW = new Date("2026-10-01T14:30:00");

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("?")[0].split("/"));
  return (await response.json()) as T;
}
const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
const draw = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
/** The classes of the screen's scrolling body: what sets its width and its gutters. */
const bodyClass = (html: string) => html.match(/class="type-scale scroll-pane[^"]*"><div class="([^"]*)"/)?.[1] ?? "";
/** One template card's markup, found by its title. */
const templateCard = (html: string, title: string) => html.split("<li ").find((part) => part.startsWith(`class="${TEMPLATE_CARD}"`) && part.includes(`>${title}<`)) ?? "";

async function seeded() {
  const qc = client();
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.plans, await demo("billing/plans"));
  qc.setQueryData(qk.apps, await demo("apps"));
  qc.setQueryData(qk.automations, await demo("automations"));
  qc.setQueryData(qk.automationDrafts, await demo("automation-drafts"));
  qc.setQueryData(qk.prReviews, await demo("pr-reviews"));
  return qc;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});
afterEach(() => vi.useRealTimers());

describe("the Automations screen", () => {
  it("is a page of the app, with no tabs: pull-request review is in the one list", () => {
    expect(appRoutes().has("/automations")).toBe(true);
    expect(appRoutes().has("/automations/reviews")).toBe(false);
  });

  it("has the title, one line of how they stand and the plan's room, and the two ways to make one", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    const words = text(html);
    expect(words).toContain("Automations");
    expect(words).toContain("3 running · 1 paused · 4 of 5 on your Pro plan");
    expect(hrefs(html)).toEqual(expect.arrayContaining(["/", "/automations/new"]));
    expect(words).toContain("Ask Tex");
    expect(words).toContain("New automation");
    // The stat strip, the big intro and the tabs are gone.
    for (const gone of ["Up next", "Things Tex does on its own", "All automations", "Pull-request review"]) expect(words).not.toContain(gone);
    expect(hrefs(html)).not.toContain("/automations/reviews");
  });

  it("lists every automation as a row: its apps, its name and line, its last and next run, its switch and menu", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    const words = text(html);
    expect(words).toContain("Apps Automation Last run Next run On");
    expect(words).toContain("Today’s meetings");
    expect(words).toContain("Every weekday at 8:00 AM · Send me today’s meetings with who’s in each one.");
    // Pull-request review: a normal row, the repo as a chip.
    expect(words.match(/Review pull requests/g)?.length).toBeGreaterThanOrEqual(2);
    expect(words).toContain("northwind/website");
    expect(words).toContain("northwind/api");
    expect(words).toContain("When a pull request opens · Patch comments on it");
    expect(words).toContain("On the next pull request");
    // Each app once, in order, named in full for a screen reader.
    expect(html).toContain('aria-label="Uses Once, Gmail, Google Drive and Tex"');
    expect(html).toContain('aria-label="Uses GitHub and Patch"');
    expect(html).toContain("+2");
    expect(html.match(/role="switch"/g)?.length).toBe(4);
    expect(html).toContain('aria-label="More for Today’s meetings"');
    expect(hrefs(html)).toContain("/automations/aut_meetings");
    expect(hrefs(html)).toContain("/automations/aut_pr_api");
  });

  it("says what needs the person in amber: an app to reconnect, a pause after failures; red only for the failed run", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    const words = text(html);
    expect(words).toContain("Google Drive needs reconnecting.");
    expect(words).toContain("Reconnect Google Drive");
    expect(words).toContain("“northwind/api” failed a few times in a row,");
    expect(words).toContain("Paused after failures");
    expect(html).toMatch(/bg-warn-soft[^"]*"[^>]*>Reconnect Google Drive/);
    // "Needs you" counts both, in an amber badge.
    expect(html).toMatch(/Needs you<span class="[^"]*text-warn[^"]*">2</);
    // The failed run's dot is the one red.
    expect(words).toContain("29 Sep · failed");
    expect(html.match(/bg-danger/g)?.length).toBe(1);
  });

  it("shows a step waiting for the person's OK, with Review leading to the approval", async () => {
    const qc = await seeded();
    const list = qc.getQueryData<{ items: Automation[] }>(qk.automations)!;
    const meetings = list.items.find((item) => item.id === "aut_meetings")!;
    const stepped: Automation = {
      ...meetings,
      steps: [{ id: "send", type: "action", title: "Send email", app: "gmail", action: "GMAIL_SEND_EMAIL", inputs: {}, instruction: null, readApps: [], askFirst: true, onlyIf: { kind: "always" }, showResult: false, risky: true }],
    };
    qc.setQueryData(qk.automations, { items: list.items.map((item) => (item.id === meetings.id ? stepped : item)) });
    const run: AutomationRun = {
      id: "arn_1",
      automationId: meetings.id,
      state: "waiting",
      test: false,
      currentStepId: "send",
      stopReason: null,
      steps: [{ stepId: "send", number: 1, title: "Send email", state: "waiting", result: null, reason: null, tries: 0, approvalId: "apr_42" }],
      resultsRemoved: false,
      startedAt: "2026-10-01T14:00:00",
      endedAt: null,
    };
    qc.setQueryData(qk.automationRuns(meetings.id), { items: [run] });
    const html = draw(qc, createElement(AutomationsPage));
    expect(text(html)).toContain("Waiting for your OK · Review");
    expect(hrefs(html)).toContain("/approvals?approval=apr_42");
    expect(html).toMatch(/Needs you<span class="[^"]*text-warn[^"]*">3</);
  });

  it("lists the drafts waiting to be saved, each with Open and save and Discard, above the automations", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    const words = text(html);
    expect(words).toContain("Waiting for you to save 2");
    expect(words).toContain("Monday pull requests");
    expect(words).toContain("Boss emails");
    expect(hrefs(html)).toContain("/automations/new?draft=drf_monday");
    expect(words).toContain("Open and save");
    expect(words).toContain("Discard");
    expect(words.indexOf("Waiting for you to save")).toBeLessThan(words.indexOf("Today’s meetings"));
  });

  it("has no drafts part when none waits", async () => {
    getStore().drafts = [];
    const qc = await seeded();
    expect(text(draw(qc, createElement(AutomationsPage)))).not.toContain("Waiting for you to save");
  });

  it("offers templates with real logos below the list, each opening its canvas", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    const words = text(html);
    expect(words).toContain("Start from a template");
    for (const name of ["Review pull requests", "Morning email summary", "Meeting prep", "A weekly reminder"]) expect(words).toContain(name);
    expect(hrefs(html)).toEqual(
      expect.arrayContaining(["/automations/new?template=pr-review", "/automations/new?template=morning-email", "/automations/new?template=meeting-prep", "/automations/new?template=weekly-reminder", "/automations/new#templates"]),
    );
    for (const href of hrefs(html).filter((link) => link.startsWith("/automations/new"))) expect(appRoutes()).toContain(pathOf(href));
    // No letter tiles: every logo is a mark.
    expect(html).not.toMatch(/font-mono font-semibold uppercase/);
  });

  it("says how one is made when there is none yet", async () => {
    const qc = await seeded();
    qc.setQueryData(qk.automations, { items: [] });
    const words = text(draw(qc, createElement(AutomationsPage)));
    expect(words).toContain("You haven’t made one yet");
    expect(words).toContain("None yet · 0 of 5 on your Pro plan");
    expect(words).not.toContain("Needs you");
  });

  it("keeps to three text sizes: 24 for the title, 14 and 12", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    const sizes = new Set([...html.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((match) => match[1]));
    expect([...sizes].sort()).toEqual(["12", "14", "24"]);
    expect(html.match(/text-\[24px\]/g)?.length).toBe(1);
    // The type guard (globals.css) brings any shared control drawn inside to those three.
    expect(html).toContain("type-scale");
  });
});

describe("the Automations screen's layout", () => {
  it("takes the whole width of the sheet, with the gutters every other screen has", async () => {
    const body = bodyClass(draw(await seeded(), createElement(AutomationsPage)));
    expect(body).toContain(GUTTER);
    expect(body).not.toMatch(/max-w-|mx-auto/);
  });

  it("sets the templates 48px below the note on what a run costs: the page's 32 and 16 more", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    expect(bodyClass(html).split(" ")).toContain("gap-8");
    expect(html.match(/<section aria-labelledby="templates" class="([^"]*)"/)?.[1].split(" ")).toContain("mt-4");
  });

  it("lays its four templates four, two or one across, each in the shared card", async () => {
    const html = draw(await seeded(), createElement(AutomationsPage));
    expect(html).toContain(`<ul class="grid gap-4 ${TEMPLATE_GRID.pick}">`);
    expect(html.split(`<li class="${TEMPLATE_CARD}"`).length - 1).toBe(4);
  });

  it("keeps what a template needs connected inside its card: beside the logos, or under them when there is no room", async () => {
    const qc = await seeded();
    const apps = qc.getQueryData<{ items: App[] }>(qk.apps)!;
    qc.setQueryData(qk.apps, { items: apps.items.map((app) => (app.slug === "googlecalendar" ? { ...app, connections: [] } : app)) });
    const meeting = templateCard(draw(qc, createElement(AutomationsPage)), "Meeting prep");
    expect(text(meeting)).toContain("Connect Google Calendar");
    // The logos and the chip share a row that wraps; the chip is never wider than the card and its words may wrap.
    expect(meeting).toMatch(/<span class="flex min-w-0 flex-wrap [^"]*"><span role="img"/);
    const chip = meeting.match(/<span class="([^"]*)">Connect (?:<!-- -->)?Google Calendar/)?.[1] ?? "";
    expect(chip).toContain("max-w-full");
    expect(chip).not.toContain("whitespace-nowrap");
  });
});
