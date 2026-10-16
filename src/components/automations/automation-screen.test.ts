import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// An automation's own page (`/automations/aut_…`), drawn from the demo backend's answers: its
// heading and controls, what the page is for, and its flow. On the server, and in a phone's first
// render, the flow is the list of steps; the canvas (React Flow) is drawn only once the screen is
// known to be wide, so it is checked on its own below.

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations/aut_meetings",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AutomationCard } from "@/components/automations/automation-card";
import { AutomationScreen } from "@/components/automations/automation-screen";
import FlowCanvas, { canvasElements, NODE_GAP, NODE_WIDTH } from "@/components/automations/flow-canvas";
import { ApiError, type Automation } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { automationFlow } from "@/lib/automation-flow";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { appRoutes } from "@/test/app-routes";

const NOW = new Date("2026-10-01T14:30:00");

async function demo<T>(path: string): Promise<{ status: number; body: T }> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return { status: response.status, body: (await response.json()) as T };
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

async function page(id: string) {
  const qc = client();
  qc.setQueryData(qk.me, (await demo("me")).body);
  qc.setQueryData(qk.prReviews, (await demo("pr-reviews")).body);
  const one = await demo<Automation>(`automations/${id}`);
  qc.setQueryData(qk.automation(id), one.body);
  return { qc, automation: one.body, html: draw(qc, createElement(AutomationScreen, { automationId: id })) };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetDemoStore(NOW);
});

describe("an automation's page", () => {
  it("is a page of the app, at /automations/<id>", () => {
    expect(appRoutes().has("/automations/[automationId]")).toBe(true);
  });

  it("names it, says what the page is, and draws its five steps", async () => {
    const { html } = await page("aut_meetings");
    const words = text(html);
    expect(words).toContain("All automations");
    expect(words).toContain("Today’s meetings");
    expect(words).toContain("This is how Tex runs it, step by step. Nothing can be changed here yet: to change it, ask Tex in chat.");
    // The steps, in order, with what each says.
    const order = ["Trigger", "Tex’s instruction", "Apps Tex may use", "Asks you first", "Results"].map((label) => words.indexOf(`${label} `));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(words).toContain("Every weekday at 8:00 AM, your time");
    expect(words).toContain("Send me today’s meetings with who’s in each one.");
    expect(words).toContain("Your connected apps, as needed");
    expect(words).toContain("Sending, deleting or paying waits for your OK");
    expect(words).toContain("Automations chat");
    expect(words).toContain("Copy to Telegram");
    // Its controls: the switch, the runs, a change asked of Tex, delete.
    expect(html).toContain('role="switch"');
    expect(words).toContain("See runs");
    expect(words).toContain("Change in chat");
    expect(words).toContain("Delete");
    // The choice of canvas or list.
    expect(words).toContain("Canvas");
    expect(words).toContain("List view");
  });

  it("draws a paused one, and a pull-request review with its repo and its own rule", async () => {
    const review = text((await page("aut_pr_api")).html);
    expect(review).toContain("northwind/api");
    expect(review).toContain("Paused after failures");
    expect(review).toContain("A pull request opens or gets new commits in northwind/api");
    expect(review).toContain("Patch reviews it");
    expect(review).toContain("Comments without asking; never merges or approves");
    expect(review).toContain("Manage");
    expect(review).not.toContain("Change in chat");
  });

  it("says an unknown automation isn't here, with the way back", async () => {
    expect((await demo("automations/aut_nope")).status).toBe(404);
    const qc = client();
    qc.getQueryCache()
      .build(qc, { queryKey: qk.automation("aut_nope") })
      .setState({ status: "error", error: new ApiError(404, "not_found", "Automation not found"), fetchStatus: "idle", data: undefined });
    const words = text(draw(qc, createElement(AutomationScreen, { automationId: "aut_nope" })));
    expect(words).toContain("This automation isn’t here");
    expect(words).toContain("It may have been deleted, or the link belongs to another account.");
    expect(words).toContain("All automations");
  });

  it("says it didn't load, with Try again, when the API fails", () => {
    const qc = client();
    qc.getQueryCache()
      .build(qc, { queryKey: qk.automation("aut_x") })
      .setState({ status: "error", error: new ApiError(503, "unavailable", "The server is busy."), fetchStatus: "idle", data: undefined });
    const words = text(draw(qc, createElement(AutomationScreen, { automationId: "aut_x" })));
    expect(words).toContain("That didn’t load");
    expect(words).toContain("Try again");
  });
});

describe("the canvas", () => {
  it("puts the five steps left to right, joined by four arrows, none of them movable", async () => {
    const automation = (await demo<Automation>("automations/aut_meetings")).body;
    const steps = automationFlow(automation, "Asia/Kolkata", NOW);
    const { nodes, edges } = canvasElements(steps, automation.kind, { selected: "apps", panelId: "p", onSelect: () => {} });
    expect(nodes.map((node) => node.id)).toEqual(["trigger", "instruction", "apps", "asks", "results"]);
    expect(nodes.map((node) => node.position)).toEqual([0, 1, 2, 3, 4].map((i) => ({ x: i * (NODE_WIDTH + NODE_GAP), y: 0 })));
    expect(nodes.every((node) => node.draggable === false && node.connectable === false)).toBe(true);
    expect(nodes.find((node) => node.id === "apps")?.data.selected).toBe(true);
    expect(edges.map((edge) => `${edge.source}>${edge.target}`)).toEqual(["trigger>instruction", "instruction>apps", "apps>asks", "asks>results"]);
  });

  it("draws each step as a button that opens its details, with React Flow's link kept", async () => {
    const automation = (await demo<Automation>("automations/aut_meetings")).body;
    const steps = automationFlow(automation, "Asia/Kolkata", NOW);
    const html = renderToStaticMarkup(
      createElement(FlowCanvas, { steps, kind: automation.kind, selected: "trigger", panelId: "panel", onSelect: () => {} }),
    );
    for (const [index, step] of steps.entries()) {
      expect(html).toContain(`aria-label="Step ${index + 1}, ${step.label.replace("’", "’")}`);
    }
    expect(html.match(/aria-controls="panel"/g)?.length).toBe(5);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("React Flow");
  });
});

describe("the card", () => {
  it("opens the automation's page from its name and its strip of five steps", async () => {
    const automation = (await demo<Automation>("automations/aut_meetings")).body;
    const html = draw(client(), createElement("ul", null, createElement(AutomationCard, { automation, timezone: "Asia/Kolkata" })));
    expect(html.match(/href="\/automations\/aut_meetings"/g)?.length).toBe(2);
    expect(html).toContain('aria-label="How it runs"');
    const words = text(html);
    for (const short of ["Schedule", "Tex", "Your apps", "Asks first", "Chat + Telegram"]) expect(words).toContain(short);
    // Screen readers hear each step in full.
    expect(words).toContain("Trigger: Every weekday at 8:00 AM, your time");
  });
});
