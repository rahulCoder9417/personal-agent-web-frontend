import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An automation's canvas page, drawn from the demo backend's answers: the top bar (the way back,
// how it stands, its steps, Test run, Save), the blocks from the apps' real catalogs, and the
// settings of the open box. The canvas itself is React Flow's, loaded on its own in the browser
// (lane-canvas.test.ts draws it). Also a draft on the canvas, pull-request review's canvas, a
// reminder that has run, and an automation whose steps don't fit the lanes.

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations/aut_meetings",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AutomationScreen } from "@/components/automations/automation-screen";
import { DraftScreen } from "@/components/automations/draft-screen";
import { RepoPicker, type PickerStatus } from "@/components/automations/repo-picker";
import { ReviewBuilder } from "@/components/automations/review-builder";
import { ApiError, type GithubRepo, type App, type Automation, type AutomationCheck, type AutomationDraft } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { EDITOR_TEMPLATES, editorFrom, emptyEditor, partsKey, toParts } from "@/lib/automation-editor";
import { changedSteps } from "@/lib/automation-flow";
import { repoChoices, typedRepo } from "@/lib/pr-review";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";

const NOW = new Date("2026-10-01T14:30:00");

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const [pathname] = path.split("?");
  const request = new Request(`http://localhost/api/v1/${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  const response = await handleDemoRequest(request, pathname.split("/"));
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}
const demo = async <T>(path: string) => (await call<T>("GET", path)).body;
const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
const draw = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));

/** The account, its apps, and each connected app's events and actions, as the canvas loads them. */
async function seeded() {
  const qc = client();
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.plans, await demo("billing/plans"));
  qc.setQueryData(qk.channels, await demo("channels"));
  qc.setQueryData(qk.prReviews, await demo("pr-reviews"));
  qc.setQueryData(qk.crew, await demo("crew"));
  const apps = await demo<{ items: App[] }>("apps");
  qc.setQueryData(qk.apps, apps);
  for (const app of apps.items) {
    qc.setQueryData(qk.appEvents(app.slug), await demo(`apps/${app.slug}/events`));
    qc.setQueryData(qk.appActions(app.slug, ""), await demo(`apps/${app.slug}/actions`));
  }
  return qc;
}

async function page(qc: QueryClient, automation: Automation) {
  qc.setQueryData(qk.automation(automation.id), automation);
  return draw(qc, createElement(AutomationScreen, { automationId: automation.id }));
}

const priya = () => EDITOR_TEMPLATES.find((template) => template.id === "urgent-boss-mail")!.fill(emptyEditor("Asia/Kolkata", NOW));

/** Priya's automation with steps, made through the demo backend (room is made first: the plan's limit). */
async function priyaSaved(): Promise<Automation> {
  await call("DELETE", "automations/aut_invoice");
  const made = await call<Automation>("POST", "automations", { ...toParts(priya()), clientRequestId: crypto.randomUUID() });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});
afterEach(() => vi.useRealTimers());

describe("a saved automation's canvas", () => {
  it("has the way back, how it stands, its steps, Test run and Saved across the top", async () => {
    const qc = await seeded();
    const html = await page(qc, await demo<Automation>("automations/aut_meetings"));
    const words = text(html);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(hrefs(html)).toContain("/automations");
    expect(words).toContain("Automations Today’s meetings");
    expect(words).toContain("On");
    expect(html).toContain('role="switch"');
    expect(words).toContain("1 of 6 steps");
    expect(words).toContain("Test run");
    expect(html).toMatch(/disabled=""[^>]*>Saved</);
    expect(html).toContain('aria-label="More for Today’s meetings"');
    // No typed arrows: the way back is a chevron.
    expect(words).not.toMatch(/[←→↑↓]/);
  });

  it("offers blocks from the connected apps' real events and actions, grouped as the lanes are", async () => {
    const qc = await seeded();
    const words = text(await page(qc, await demo<Automation>("automations/aut_meetings")));
    for (const group of ["Start when", "Read from an app", "Tex and the crew", "Write or send"]) expect(words).toContain(group);
    expect(words).toContain("Drag one onto the canvas, or click it to add it.");
    // Gmail is connected in the demo: its event, a reading action and a writing one.
    expect(words).toContain("New email Gmail");
    expect(words).toContain("Fetch emails Gmail");
    expect(words).toContain("Send email Gmail");
    expect(words).toContain("Ask Tex Decide, sum up, write");
    // An app not connected yet: connect first, in amber.
    expect(words).toContain("Connect first");
  });

  it("one instruction is Just Tex: its box opens with the instruction, the apps Tex may use and when it asks first", async () => {
    const qc = await seeded();
    const automation = await demo<Automation>("automations/aut_meetings");
    const html = await page(qc, automation);
    const words = text(html);
    expect(html).toContain('aria-label="Settings for the open box"');
    expect(words).toContain("What Tex does each time");
    expect(html).toContain(automation.instruction.replace(/’/g, "’"));
    expect(words).toContain("Apps Tex may use");
    expect(words).toContain("When Tex asks you first");
    expect(words).toContain("Uses credits like a chat reply");
  });

  it("with steps, opens Tex's first step, and counts the steps", async () => {
    const qc = await seeded();
    const automation = await priyaSaved();
    const words = text(await page(qc, automation));
    expect(words).toContain("4 of 6 steps");
    expect(words).toContain("What Tex does in this step");
    expect(words).toContain("Pick the emails that are urgent and say why.");
    expect(words).toContain("Move down");
    // It has two Tex steps, so this one can go (the last one can't).
    expect(words).toContain("Remove step");
  });

  it("marks what the server found in amber, says how many to fix, and shows a full plan as a notice", async () => {
    const qc = await seeded();
    const automation = await priyaSaved();
    const me = qc.getQueryData<{ timezone: string }>(qk.me)!;
    const check: AutomationCheck = {
      ok: false,
      kind: "repeat",
      nextRuns: [],
      problems: [
        { step: "steps", stepId: "pick", code: "invalid", message: "Step 2: write what Tex does in this step." },
        { step: null, stepId: null, code: "plan_limit", message: "Your Pro plan allows 5 automations, and they are used." },
      ],
    };
    qc.setQueryData(qk.automationCheck(partsKey(editorFrom(automation, me.timezone)), automation.id), check);
    const html = await page(qc, automation);
    const words = text(html);
    expect(words).toContain("1 to fix");
    expect(words).toContain("Step 2: write what Tex does in this step.");
    expect(words).toContain("Your Pro plan allows 5 automations, and they are used.");
    expect(words).toContain("See plans");
    expect(html).toContain("bg-warn-soft");
    expect(html).not.toMatch(/bg-danger-soft[^"]*"[^>]*role="alert"/);
  });

  it("an automation whose steps don't run read, Tex, write is shown in the order it runs, nothing moved", async () => {
    const qc = await seeded();
    await call("DELETE", "automations/aut_invoice");
    const made = await call<Automation>("POST", "automations", {
      title: "Mixed order",
      instruction: "Check twice",
      runAt: null,
      cron: "0 9 * * 1",
      timezone: "Asia/Kolkata",
      trigger: null,
      askFirst: "risky",
      copyTo: null,
      clientRequestId: crypto.randomUUID(),
      steps: [
        { id: "first", type: "tex", instruction: "Say what to look for." },
        { id: "fetch", type: "action", app: "gmail", action: "GMAIL_FETCH_EMAILS", inputs: { query: "is:unread" } },
        { id: "sum", type: "tex", instruction: "Sum them up." },
      ],
    });
    const words = text(await page(qc, made.body));
    expect(words).toContain("Shown in the order they run.");
    expect(words).toContain("Sort into lanes");
    expect(words).toContain("3 of 6 steps");
  });

  it("a reminder that has run is shown as it ran, not changed", async () => {
    const qc = await seeded();
    const done: Automation = { ...(await demo<Automation>("automations/aut_invoice")), lastRunAt: "2026-09-30T10:00:00", nextRunAt: null };
    const html = await page(qc, done);
    const words = text(html);
    expect(words).toContain("This reminder has run its one time, so it is finished.");
    expect(words).toContain("Done");
    expect(words).not.toContain("Blocks");
    expect(words).not.toContain("Test run");
    expect(words).not.toContain("Save");
  });

  it("says an unknown automation isn't here, and a failed load can be tried again", () => {
    const qc = client();
    qc.getQueryCache()
      .build(qc, { queryKey: qk.automation("aut_nope") })
      .setState({ status: "error", error: new ApiError(404, "not_found", "Automation not found"), fetchStatus: "idle", data: undefined });
    const missing = text(draw(qc, createElement(AutomationScreen, { automationId: "aut_nope" })));
    expect(missing).toContain("This automation isn’t here");
    expect(missing).toContain("All automations");
    qc.getQueryCache()
      .build(qc, { queryKey: qk.automation("aut_x") })
      .setState({ status: "error", error: new ApiError(503, "unavailable", "The server is busy."), fetchStatus: "idle", data: undefined });
    const failed = text(draw(qc, createElement(AutomationScreen, { automationId: "aut_x" })));
    expect(failed).toContain("That didn’t load");
    expect(failed).toContain("Try again");
  });
});

describe("pull-request review's canvas", () => {
  it("a repo with review on: its repo, how it stands, pause and turn off, and one review from the chat", async () => {
    const qc = await seeded();
    const html = await page(qc, await demo<Automation>("automations/aut_pr_api"));
    const words = text(html);
    expect(words).toContain("Automations Review pull requests");
    expect(words).toContain("northwind/api");
    expect(words).toContain("Paused after failures");
    expect(words).toContain("Paused after a few reviews in a row failed.");
    expect(words).toContain("Your GitHub account needs admin access to it. Each repo you review counts as one automation on your plan.");
    expect(words).toContain("Turn off");
    expect(words).toContain("Just one pull request?");
    expect(html).toContain('role="switch"');
    // Its boxes are fixed: no blocks, no steps to count, no test run.
    expect(words).not.toContain("Blocks");
    expect(words).not.toContain("of 6 steps");
    expect(words).not.toContain("Test run");
  });

  it("a new one: the repo to type, Turn on review, and GitHub's notice when it isn't connected", async () => {
    const qc = await seeded();
    const words = text(draw(qc, createElement(ReviewBuilder, { automation: null })));
    expect(words).toContain("Not on yet");
    expect(words).toContain("Turn on review");
    expect(words).toContain("Like acme/website, or paste the repo’s GitHub link.");
    const apps = qc.getQueryData<{ items: App[] }>(qk.apps)!;
    qc.setQueryData(qk.apps, { items: apps.items.map((app) => (app.slug === "github" ? { ...app, connections: [] } : app)) });
    const html = draw(qc, createElement(ReviewBuilder, { automation: null }));
    expect(text(html)).toContain("GitHub isn’t connected.");
    expect(text(html)).toContain("Connect GitHub");
    expect(html).toContain("bg-warn-soft");
  });
});

describe("a draft on the canvas", () => {
  async function withDraft(draft: AutomationDraft) {
    const qc = await seeded();
    qc.setQueryData(qk.automationDraft(draft.id), draft);
    return qc;
  }

  it("says it isn't saved yet and how long it is kept, with Save and Save paused, ready to change", async () => {
    const draft = await demo<AutomationDraft>("automation-drafts/drf_monday");
    const html = draw(await withDraft(draft), createElement(DraftScreen, { draftId: draft.id }));
    const words = text(html);
    expect(words).toContain("Monday pull requests");
    expect(words).toContain("Not saved yet. Tex proposed this in the chat. Nothing runs until you save it");
    expect(words).toMatch(/Expires in \d+ days/);
    expect(words).toContain("Save paused");
    expect(words).toContain("Save");
    expect(words).toContain("Blocks");
    expect(html).toContain('aria-label="More for Monday pull requests"');
  });

  it("points a replaced draft to the newer one, and a saved one to its automation", async () => {
    const replaced = await demo<AutomationDraft>("automation-drafts/drf_monday_10");
    const html = draw(await withDraft(replaced), createElement(DraftScreen, { draftId: replaced.id }));
    expect(text(html)).toContain("Tex made a newer version of this draft, so this one can no longer be saved.");
    expect(hrefs(html)).toContain("/automations/new?draft=drf_monday");
    expect(text(html)).not.toContain("Save paused");

    const saved = { ...(await demo<AutomationDraft>("automation-drafts/drf_monday")), status: "saved" as const, automationId: "aut_9" };
    const savedHtml = draw(await withDraft(saved), createElement(DraftScreen, { draftId: saved.id }));
    expect(text(savedHtml)).toContain("Saved. It runs from now on");
    expect(hrefs(savedHtml)).toContain("/automations/aut_9");
  });

  it("says an expired or discarded draft is over, with the way back to the chat", async () => {
    const open = await demo<AutomationDraft>("automation-drafts/drf_boss");
    expect(text(draw(await withDraft({ ...open, status: "expired" }), createElement(DraftScreen, { draftId: open.id })))).toContain("This draft expired. Ask Tex again. A draft is kept for 7 days.");
    expect(text(draw(await withDraft({ ...open, status: "discarded" }), createElement(DraftScreen, { draftId: open.id })))).toContain("You discarded this draft. Nothing was set up.");
  });

  it("a change says saving replaces the automation, and knows the boxes it alters", async () => {
    const current = await demo<Automation>("automations/aut_meetings");
    const change: AutomationDraft = {
      ...(await demo<AutomationDraft>("automation-drafts/drf_monday")),
      id: "drf_change",
      changeOf: "aut_meetings",
      title: current.title,
      instruction: current.instruction,
      cron: "30 8 * * 1-5",
      apps: ["googlecalendar"],
      copyTo: "telegram",
    };
    expect([...changedSteps(change, current)]).toEqual(["trigger", "apps"]);
    const qc = await withDraft(change);
    qc.setQueryData(qk.automation("aut_meetings"), current);
    const words = text(draw(qc, createElement(DraftScreen, { draftId: change.id })));
    expect(words).toContain("Saving replaces “Today’s meetings” with this version.");
  });

  it("says a draft that isn't there isn't here", () => {
    const qc = client();
    qc.getQueryCache()
      .build(qc, { queryKey: qk.automationDraft("drf_gone") })
      .setState({ status: "error", error: new ApiError(404, "not_found", "Draft not found"), fetchStatus: "idle", data: undefined });
    expect(text(draw(qc, createElement(DraftScreen, { draftId: "drf_gone" })))).toContain("This draft isn’t here");
  });
});

describe("the repo picker", () => {
  const repo = (owner: string, name: string, priv: boolean, pushedAt: string | null): GithubRepo => ({ owner, name, fullName: `${owner}/${name}`, private: priv, defaultBranch: "main", pushedAt });
  const REPOS = [
    repo("acme", "old", false, "2026-08-01T10:00:00Z"),
    repo("rahulcoder9417", "Code-Smith", true, "2026-09-30T10:00:00Z"),
    repo("acme", "website", false, "2026-09-29T10:00:00Z"),
  ];
  const picker = (props: { status?: PickerStatus; query?: string; reviewed?: { owner: string; repo: string }[]; repos?: GithubRepo[] } = {}) =>
    text(
      renderToStaticMarkup(
        createElement(RepoPicker, {
          id: "x",
          status: props.status ?? "ready",
          repos: props.repos ?? REPOS,
          reviewed: props.reviewed ?? [],
          query: props.query ?? "",
          onQuery: () => {},
          chosen: null,
          onChoose: () => {},
          now: NOW,
        }),
      ),
    );

  it("lists owner/name, the most recently pushed first, with a Private tag and when it was pushed", () => {
    const words = picker();
    expect(words).toContain("rahulcoder9417/ Code-Smith");
    expect(words.indexOf("Code-Smith")).toBeLessThan(words.indexOf("website"));
    expect(words.indexOf("website")).toBeLessThan(words.indexOf("old"));
    expect(words.match(/Private/g)).toHaveLength(1);
    expect(words).toContain("pushed yesterday");
    expect(words).toContain("pushed 1 Aug");
  });

  it("filters by owner or name", () => {
    expect(repoChoices(REPOS, "acme", []).map((choice) => choice.repo.name)).toEqual(["website", "old"]);
    expect(repoChoices(REPOS, "SMITH", []).map((choice) => choice.repo.name)).toEqual(["Code-Smith"]);
    expect(repoChoices(REPOS, "acme / web", []).map((choice) => choice.repo.name)).toEqual(["website"]);
    const words = picker({ query: "smith" });
    expect(words).toContain("Code-Smith");
    expect(words).not.toContain("website");
  });

  it("shows Review on for a repo already reviewed and disables it", () => {
    const html = renderToStaticMarkup(
      createElement(RepoPicker, { id: "x", status: "ready", repos: REPOS, reviewed: [{ owner: "ACME", repo: "website" }], query: "", onQuery: () => {}, chosen: null, onChoose: () => {}, now: NOW }),
    );
    expect(text(html)).toContain("Review on");
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^]*?website/);
  });

  it("offers a typed owner/repo or link that isn't in the list as a Use row", () => {
    expect(picker({ query: "zed/tool" })).toContain("Use zed/tool");
    expect(picker({ query: "https://github.com/zed/tool/pull/3" })).toContain("Use zed/tool");
    expect(picker({ query: "acme/website" })).not.toContain("Use acme/website");
    expect(typedRepo(REPOS, "not a repo")).toBeNull();
    expect(typedRepo(REPOS, "")).toBeNull();
  });

  it("says so when the repos can't be loaded, and typing still works", () => {
    const words = picker({ status: "error", repos: [], query: "zed/tool" });
    expect(words).toContain("Couldn’t load your repos right now — type owner/repo instead.");
    expect(words).toContain("Use zed/tool");
    expect(picker({ status: "connect", repos: [] })).toContain("Connect GitHub");
  });

  it("draws skeleton rows while loading, and the new review page lists the account's repos from the demo", async () => {
    const html = renderToStaticMarkup(createElement(RepoPicker, { id: "x", status: "loading", repos: [], reviewed: [], query: "", onQuery: () => {}, chosen: null, onChoose: () => {} }));
    expect(html.match(/animate-pulse/g)).toHaveLength(3);
    const items = (await demo<{ items: GithubRepo[] }>("github/repos")).items;
    expect(items.length).toBeGreaterThan(2);
    const qc = await seeded();
    qc.setQueryData(qk.githubRepos, { items });
    const page = text(draw(qc, createElement(ReviewBuilder, { automation: null })));
    expect(page).toContain("northwind/ website");
    expect(page).toContain("Review on");
  });
});
