import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `/automations/new`: ask Tex in words (the chat opens with them), or pick how it works and build
// it on the canvas; every template below. `?shape=` and `?template=` open the canvas filled in.

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations/new",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import nextConfig from "../../../next.config";
import { NewAutomation, NewBuilder, SHAPE_GRID } from "@/components/automations/new-automation";
import { allTemplates, TEMPLATE_CARD, TEMPLATE_GRID } from "@/components/automations/templates";
import { GUTTER } from "@/components/page";
import { qk } from "@/lib/api/hooks";
import { OLD_AUTOMATION_ADDRESSES, PR_REVIEW_NEW_PATH } from "@/lib/automation-address";
import { SHAPES } from "@/lib/automation-lanes";
import { PLACES } from "@/lib/help";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { appRoutes, pathOf } from "@/test/app-routes";

const NOW = new Date("2026-10-01T14:30:00");

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}
const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
const draw = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));

async function seeded() {
  const qc = client();
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.apps, await demo("apps"));
  qc.setQueryData(qk.channels, await demo("channels"));
  return qc;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});
afterEach(() => vi.useRealTimers());

describe("the new-automation page", () => {
  it("is a page of the app, with the way back as a breadcrumb", async () => {
    expect(appRoutes().has("/automations/new")).toBe(true);
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(text(html)).toContain("Automations New automation");
    expect(hrefs(html)).toContain("/automations");
    expect(text(html)).not.toMatch(/[←→]/);
  });

  it("asks Tex in words: Tex's face, the box, ideas that fill it, and Draft it", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    const words = text(html);
    // Tex's own face (its glyph), not a letter.
    expect(html).toContain('viewBox="66 16 168 168"');
    expect(words).toContain("Ask Tex to set it up");
    expect(words).toContain("Tex drafts it on the canvas. Nothing runs until you save.");
    expect(html).toContain("<textarea");
    for (const idea of ["Sum up my email every morning", "Review my pull requests", "Remind me every Friday"]) expect(words).toContain(idea);
    // Nothing typed yet: Draft it waits.
    expect(html).toMatch(/disabled=""[^>]*>Draft it</);
  });

  it("offers the four shapes, each opening the canvas with that shape", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    const words = text(html);
    expect(words).toContain("Or pick how it works");
    for (const shape of SHAPES) {
      expect(words).toContain(shape.title);
      expect(hrefs(html)).toContain(`/automations/new?shape=${shape.id}`);
    }
    expect(words).toContain("No reading");
    expect(words).toContain("No writing");
  });

  it("has every template at its foot, pull-request review among them", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain('id="templates"');
    expect(hrefs(html)).toEqual(expect.arrayContaining([PR_REVIEW_NEW_PATH, "/automations/new?template=daily-briefing", "/automations/new?template=urgent-boss-mail"]));
  });
});

describe("the new-automation page's layout", () => {
  it("takes the whole width of the sheet, with the gutters every other screen has", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    const body = html.match(/class="type-scale scroll-pane[^"]*"><div class="([^"]*)"/)?.[1] ?? "";
    expect(body).toContain(GUTTER);
    expect(body).not.toMatch(/max-w-|mx-auto/);
  });

  it("draws every template in the Automations list's own card, in as many columns as fit, none narrower than 280px", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain(`<ul class="grid gap-4 ${TEMPLATE_GRID.all}">`);
    expect(html.split(`<li class="${TEMPLATE_CARD}"`).length - 1).toBe(allTemplates().length);
  });

  it("keeps each shape's picture inside its card on a phone: the lines give way first, then the words wrap", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain(`<ul class="grid gap-4 ${SHAPE_GRID}">`);
    expect(html).toContain("h-0.5 min-w-0 flex-1");
    const pill = html.match(/<span class="([^"]*)">No reading</)?.[1] ?? "";
    expect(pill).toContain("border-dashed");
    expect(pill).not.toContain("whitespace-nowrap");
  });
});

describe("a new automation on the canvas", () => {
  it("from a shape: its steps to fill in, nothing saved, and no amber before a box is worked on", async () => {
    const html = draw(await seeded(), createElement(NewBuilder, { shapeId: "read-act" }));
    const words = text(html);
    expect(words).toContain("Automations New automation");
    expect(words).toContain("Not saved");
    expect(words).toContain("3 of 6 steps");
    expect(words).toContain("Save paused");
    // The trigger opens first, its kinds one under another.
    for (const mode of ["Once", "On a schedule", "On an app event"]) expect(words).toContain(mode);
    expect(html).not.toContain('role="alert"');
  });

  it("Just Tex has no steps: one instruction", async () => {
    expect(text(draw(await seeded(), createElement(NewBuilder, { shapeId: "just-tex" })))).toContain("1 of 6 steps");
  });

  it("from a template: filled in", async () => {
    const words = text(draw(await seeded(), createElement(NewBuilder, { templateId: "morning-email" })));
    expect(words).toContain("Morning email summary");
    expect(words).toContain("2 of 6 steps");
    expect(words).toContain("Every day at 9:00 AM");
  });
});

describe("the address pull-request review had", () => {
  it("leads to the list, and Help leads to the template", async () => {
    expect(OLD_AUTOMATION_ADDRESSES).toEqual([{ source: "/automations/reviews", destination: "/automations", permanent: false }]);
    expect(await nextConfig.redirects?.()).toEqual(expect.arrayContaining([{ source: "/automations/reviews", destination: "/automations", permanent: false }]));
    expect(PLACES.prReview.href).toBe(PR_REVIEW_NEW_PATH);
    expect(appRoutes()).toContain(pathOf(PR_REVIEW_NEW_PATH));
  });
});
