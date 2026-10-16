import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A draft on its page (`/automations/new?draft=…`, or `/automations/<it>?draft=…` for a change),
// the drafts waiting on the Automations page, and `/automations/new` without a draft. Drawn from
// the demo backend's answers.

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations/new",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams("draft=drf_monday"),
}));

import AutomationsPage from "@/app/(app)/automations/page";
import { DraftScreen } from "@/components/automations/draft-screen";
import { NewAutomation } from "@/components/automations/new-automation";
import { ApiError, type Automation, type AutomationDraft } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { changedSteps } from "@/lib/automation-flow";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { getStore } from "@/lib/demo/store";
import { appRoutes } from "@/test/app-routes";

const NOW = new Date("2026-10-01T14:30:00");

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("?")[0].split("/"));
  return (await response.json()) as T;
}
function client() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
}
const draw = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

async function withDraft(draft: AutomationDraft) {
  const qc = client();
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.automationDraft(draft.id), draft);
  return qc;
}

beforeEach(() => {
  // The demo's drafts are kept 7 days from "now": the clock stays at NOW, so none has expired.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a draft's page", () => {
  it("is a page of the app, at /automations/new", () => {
    expect(appRoutes().has("/automations/new")).toBe(true);
  });

  it("says it isn't saved yet, what the page is, and offers Save, Save paused and Discard, over the steps", async () => {
    const draft = await demo<AutomationDraft>("automation-drafts/drf_monday");
    const words = text(draw(await withDraft(draft), createElement(DraftScreen, { draftId: draft.id })));
    expect(words).toContain("Monday pull requests");
    expect(words).toContain("A draft · On repeat");
    expect(words).toContain("Not saved yet. Tex proposed this in the chat. Nothing runs until you save it.");
    expect(words).toMatch(/Expires in \d+ days/);
    expect(words).toContain("How Tex would run it, step by step.");
    for (const action of ["Save", "Save paused", "Discard"]) expect(words).toContain(action);
    expect(words).toContain("Every Monday at 9:00 AM, your time");
    expect(words).toContain("GitHub");
  });

  it("points a replaced draft to the newer one, and a saved one to its automation", async () => {
    const replaced = await demo<AutomationDraft>("automation-drafts/drf_monday_10");
    const html = draw(await withDraft(replaced), createElement(DraftScreen, { draftId: replaced.id }));
    expect(text(html)).toContain("Tex made a newer version of this draft, so this one can no longer be saved.");
    expect(html).toContain('href="/automations/new?draft=drf_monday"');
    expect(text(html)).not.toContain("Save paused");

    const saved = { ...(await demo<AutomationDraft>("automation-drafts/drf_monday")), status: "saved" as const, automationId: "aut_9" };
    const savedHtml = draw(await withDraft(saved), createElement(DraftScreen, { draftId: saved.id }));
    expect(text(savedHtml)).toContain("Saved. It runs from now on");
    expect(savedHtml).toContain('href="/automations/aut_9"');
  });

  it("says an expired or discarded draft is over, with the way back to the chat", async () => {
    const open = await demo<AutomationDraft>("automation-drafts/drf_boss");
    expect(text(draw(await withDraft({ ...open, status: "expired" }), createElement(DraftScreen, { draftId: open.id })))).toContain(
      "This draft expired. Ask Tex again. A draft is kept for 7 days.",
    );
    expect(text(draw(await withDraft({ ...open, status: "discarded" }), createElement(DraftScreen, { draftId: open.id })))).toContain(
      "You discarded this draft. Nothing was set up.",
    );
  });

  it("says a draft that isn't there (removed, or another account's) isn't here", () => {
    const qc = client();
    qc.getQueryCache()
      .build(qc, { queryKey: qk.automationDraft("drf_gone") })
      .setState({ status: "error", error: new ApiError(404, "not_found", "Draft not found"), fetchStatus: "idle", data: undefined });
    expect(text(draw(qc, createElement(DraftScreen, { draftId: "drf_gone" })))).toContain("This draft isn’t here");
  });

  it("marks the steps a change alters, and says saving replaces the automation", async () => {
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
    const html = draw(qc, createElement(DraftScreen, { draftId: change.id }));
    const words = text(html);
    expect(words).toContain("A change · On repeat");
    expect(words).toContain("Saving replaces “Today’s meetings” with this version.");
    expect(words).toContain("The steps marked “Changed” are different from");
    expect(html.match(/>Changed</g)?.length).toBe(2);
  });
});

describe("the Automations page", () => {
  it("lists the drafts waiting to be saved, each with its steps, Open and save, and Discard", async () => {
    const qc = client();
    qc.setQueryData(qk.me, await demo("me"));
    qc.setQueryData(qk.automations, await demo("automations"));
    qc.setQueryData(qk.automationDrafts, await demo("automation-drafts"));
    const html = draw(qc, createElement(AutomationsPage));
    const words = text(html);
    expect(words).toContain("Waiting for you to save 2");
    expect(words).toContain("Drafts Tex proposed in the chat. None of them runs until you save it; each is kept for 7 days.");
    expect(words).toContain("Monday pull requests");
    expect(words).toContain("Boss emails");
    expect(html).toContain('href="/automations/new?draft=drf_monday"');
    expect(words).toContain("Open and save");
    expect(words).toContain("Discard");
    // The drafts come before the automations.
    expect(words.indexOf("Waiting for you to save")).toBeLessThan(words.indexOf("Your automations"));
  });

  it("has no drafts section when none waits", async () => {
    getStore().drafts = [];
    const qc = client();
    qc.setQueryData(qk.automations, await demo("automations"));
    qc.setQueryData(qk.automationDrafts, await demo("automation-drafts"));
    expect(text(draw(qc, createElement(AutomationsPage)))).not.toContain("Waiting for you to save");
  });

  it("says how one is made: Tex drafts it, you save it, nothing runs before", async () => {
    const qc = client();
    qc.setQueryData(qk.automations, { items: [] });
    const words = text(draw(qc, createElement(AutomationsPage)));
    expect(words).toContain("Ask Tex and it shows you a draft to save, or build one yourself, box by box, with New automation. Nothing runs before you save it.");
    expect(words).toContain("New automation");
    expect(words).toContain("Tex drafts it");
    expect(words).toContain("You save it");
  });
});

describe("/automations/new without a draft", () => {
  it("is an empty canvas to build one by hand, with templates, and the way to ask Tex instead", async () => {
    const qc = client();
    qc.setQueryData(qk.me, await demo("me"));
    qc.setQueryData(qk.apps, await demo("apps"));
    qc.setQueryData(qk.channels, await demo("channels"));
    qc.setQueryData(qk.automations, await demo("automations"));
    const html = draw(qc, createElement(NewAutomation));
    const words = text(html);
    expect(words).toContain("A new automation");
    expect(words).toContain("Build it box by box");
    expect(words).toContain("Start from a template");
    expect(words).toContain("Daily briefing at 8");
    expect(words).toContain("Pull requests on Monday at 9");
    // On the server (and a phone's first paint) the five parts are a form, one under another.
    for (const label of ["Trigger", "Tex’s instruction", "Apps Tex may use", "Asks you first", "Results"]) expect(words).toContain(label);
    expect(words).toContain("Pick when it runs");
    expect(words).toContain("Your Automations chat");
    expect(words).toContain("Save paused");
    expect(words).toContain("Ask Tex to change this");
    expect(words).toContain("Rather say it in words?");
    // An empty canvas shows no red before a box was worked on.
    expect(html).not.toContain('role="alert"');
  });
});
