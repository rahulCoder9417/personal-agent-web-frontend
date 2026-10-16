import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Building and changing an automation by hand: the editor on an automation's page and a draft's,
// drawn from the demo backend's answers. On the server, and in a phone's first paint, the five
// parts are a form, one under another (the canvas is drawn only once the screen is known to be
// wide). The server's check is put in the cache under the parts it was asked for, as it would come.

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations/aut_meetings",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AutomationScreen } from "@/components/automations/automation-screen";
import { DraftScreen } from "@/components/automations/draft-screen";
import { editorSteps } from "@/components/automations/automation-editor";
import type { Automation, AutomationCheck, AutomationDraft } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { editorFrom, emptyEditor, partsKey } from "@/lib/automation-editor";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";

const NOW = new Date("2026-10-01T14:30:00");

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
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

async function seeded() {
  const qc = client();
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.apps, await demo("apps"));
  qc.setQueryData(qk.channels, await demo("channels"));
  qc.setQueryData(qk.prReviews, await demo("pr-reviews"));
  return qc;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});
afterEach(() => vi.useRealTimers());

describe("editing a saved automation", () => {
  it("opens as the form of its five parts, filled in, with Save changes and Cancel", async () => {
    const qc = await seeded();
    const automation = await demo<Automation>("automations/aut_meetings");
    qc.setQueryData(qk.automation(automation.id), automation);
    const html = draw(qc, createElement(AutomationScreen, { automationId: automation.id, editing: true }));
    const words = text(html);
    expect(words).toContain("Change any box: click it on the canvas");
    expect(html).toContain(`value="${automation.title}"`);
    expect(words).toContain("On a schedule");
    expect(words).toContain("On days");
    // The time picker shows the time as people read it.
    expect(html).toContain('value="8:00 AM"');
    expect(words).toContain("Also a copy to Telegram");
    expect(words).toContain("Save changes");
    expect(words).toContain("Cancel");
    expect(words).toContain("Ask Tex to change this");
    // In edit mode the read-only flow and its controls step aside.
    expect(words).not.toContain("Run once now");
    expect(html).not.toContain('role="alert"');
  });

  it("a problem the server found is shown in red on its box, and a full plan as a banner", async () => {
    const qc = await seeded();
    const automation = await demo<Automation>("automations/aut_meetings");
    qc.setQueryData(qk.automation(automation.id), automation);
    const me = qc.getQueryData<{ timezone: string }>(qk.me)!;
    const check: AutomationCheck = {
      ok: false,
      kind: "repeat",
      nextRuns: [],
      problems: [
        { step: "apps", stepId: null, code: "invalid", message: "Connect Linear first, or take it off the list." },
        { step: null, stepId: null, code: "plan_limit", message: "Your Pro plan allows 5 automations, and they are used." },
      ],
    };
    qc.setQueryData(qk.automationCheck(partsKey(editorFrom(automation, me.timezone)), automation.id), check);
    const html = draw(qc, createElement(AutomationScreen, { automationId: automation.id, editing: true }));
    const words = text(html);
    expect(html).toContain('role="alert"');
    expect(words).toContain("Connect Linear first, or take it off the list.");
    expect(words).toContain("Your Pro plan allows 5 automations, and they are used.");
    expect(words).toContain("See plans");
    expect(words).toContain("Some boxes need a fix before it can be saved.");
    // The box with the problem is the Apps box: its section is marked.
    const apps = html.slice(html.indexOf('aria-label="Apps Tex may use"'));
    expect(apps.slice(0, 200)).toContain("border-danger");
  });

  it("pull-request review and a finished reminder are not edited here", async () => {
    const qc = await seeded();
    const review = await demo<Automation>("automations/aut_pr_website");
    qc.setQueryData(qk.automation(review.id), review);
    const words = text(draw(qc, createElement(AutomationScreen, { automationId: review.id, editing: true })));
    expect(words).not.toContain("Save changes");
    expect(words).not.toContain("Run once now");
    expect(words).toContain("Manage");
  });
});

describe("editing a draft", () => {
  it("an open draft offers Edit beside Save", async () => {
    const qc = await seeded();
    const draft = await demo<AutomationDraft>("automation-drafts/drf_monday");
    qc.setQueryData(qk.automationDraft(draft.id), draft);
    const words = text(draw(qc, createElement(DraftScreen, { draftId: draft.id })));
    expect(words).toContain("Save paused");
    expect(words).toContain("Edit");
    expect(words).toContain("Edit changes any box here");
  });
});

describe("the boxes while they are empty", () => {
  it("each empty box asks for what it needs", () => {
    const steps = editorSteps(emptyEditor("UTC", NOW), { kind: "new" }, "UTC");
    expect(steps.map((step) => step.title)).toEqual([
      "Pick when it runs",
      "Say what Tex does",
      "Your connected apps, as needed",
      "Sending, deleting or paying waits for your OK",
      "Automations chat",
    ]);
    const event = editorSteps({ ...emptyEditor("UTC", NOW), mode: "event", title: "Boss" }, { kind: "new" }, "UTC");
    expect(event[0].title).toBe("Pick an app and what happens");
    expect(event[1].title).toBe("Boss");
  });
});
