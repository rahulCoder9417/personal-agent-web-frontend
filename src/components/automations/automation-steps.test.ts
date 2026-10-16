import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Automations with steps (phase 4) on the web: the demo backend's checks per step, the actions
// list, a test run's trail; the editor's phone form with its step cards, "+ Add a step" and the
// limit of 6; a step's problem on its own card; the automation's page with its last run; and the
// canvas with dagre only in its own chunk.

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations/aut_x",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AutomationScreen } from "@/components/automations/automation-screen";
import { stepsElements } from "@/components/automations/steps-canvas";
import type { AppAction, Automation, AutomationCheck, AutomationDraft, AutomationRun } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { EDITOR_TEMPLATES, editorFrom, emptyEditor, partsKey, toParts } from "@/lib/automation-editor";
import { automationFlow } from "@/lib/automation-flow";
import { emptyStep, insertStep } from "@/lib/automation-steps";
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
const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
const draw = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

const priya = () => EDITOR_TEMPLATES.find((template) => template.id === "urgent-boss-mail")!.fill(emptyEditor("Asia/Kolkata", NOW));

async function seeded() {
  const qc = client();
  qc.setQueryData(qk.me, (await call("GET", "me")).body);
  qc.setQueryData(qk.apps, (await call("GET", "apps")).body);
  qc.setQueryData(qk.channels, (await call("GET", "channels")).body);
  return qc;
}

/** Priya's automation, made through the demo backend (room is made first: the plan's limit). */
async function priyaSaved(): Promise<Automation> {
  await call("DELETE", "automations/aut_invoice");
  const made = await call<Automation>("POST", "automations", { ...toParts(priya()), clientRequestId: crypto.randomUUID() });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});
afterEach(() => vi.useRealTimers());

describe("the demo backend, with steps", () => {
  it("checks each step on its own box, and the list at 7", async () => {
    const parts = toParts(priya());
    const ok = await call<AutomationCheck>("POST", "automations/check", parts);
    expect(ok.body.problems).toEqual([]);
    const bad = await call<AutomationCheck>("POST", "automations/check", {
      ...parts,
      steps: [{ id: "a", type: "action", app: "gmail", action: "GMAIL_SEND_EMAIL", inputs: { to: "x" } }, { id: "b", type: "tex", onlyIf: { kind: "mentions", words: [] } }],
    });
    expect(bad.body.problems.map((problem) => [problem.stepId, problem.message])).toEqual([
      ["a", "Step 1: Send email has no input `to`. Its inputs: recipient_email, subject, body."],
      ["b", "Step 2: give at least one word for “mentions”."],
      ["b", "Step 2: write what Tex does in this step."],
    ]);
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, type: "tex", instruction: "Hi" }));
    const many = await call<AutomationCheck>("POST", "automations/check", { ...parts, steps: seven });
    expect(many.body.problems).toContainEqual({ step: "steps", stepId: null, code: "invalid", message: "An automation has up to 6 steps." });
  });

  it("lists an app's actions; saves the steps, the send locked to ask first; a test run leaves its trail", async () => {
    const actions = await call<{ items: AppAction[] }>("GET", "apps/gmail/actions?search=send");
    expect(actions.body.items.map((item) => item.slug)).toEqual(["GMAIL_SEND_EMAIL"]);
    const automation = await priyaSaved();
    expect(automation.apps).toEqual(["gmail"]);
    expect(automation.steps?.map((step) => [step.id, step.askFirst, step.risky])).toEqual([
      ["fetch", false, false],
      ["pick", false, false],
      ["draft", false, false],
      ["send", true, true],
    ]);
    await call("POST", `automations/${automation.id}/run`, { clientRequestId: crypto.randomUUID() });
    await vi.runAllTimersAsync();
    const runs = await call<{ items: AutomationRun[] }>("GET", `automations/${automation.id}/runs`);
    expect(runs.body.items[0]).toMatchObject({ state: "waiting", test: true, currentStepId: "send" });
    expect(runs.body.items[0].steps.map((step) => step.state)).toEqual(["done", "done", "done", "waiting"]);
  });

  it("Tex's change of a paused automation, saved without saying, stays paused", async () => {
    const automation = await priyaSaved();
    await call("PATCH", `automations/${automation.id}`, { enabled: false });
    const draft = await call<AutomationDraft>("POST", "automation-drafts", { ...toParts(priya()), cron: "30 8 * * 1-5", changeOf: automation.id });
    const saved = await call<{ automation: Automation }>("POST", `automation-drafts/${draft.body.id}/save`, {});
    expect(saved.body.automation).toMatchObject({ id: automation.id, enabled: false, cron: "30 8 * * 1-5" });
  });
});

describe("editing steps on a phone", () => {
  it("each step is a card with its condition; Add a step; a step's problem on its own card", async () => {
    const qc = await seeded();
    const automation = await priyaSaved();
    qc.setQueryData(qk.automation(automation.id), automation);
    const me = qc.getQueryData<{ timezone: string }>(qk.me)!;
    const start = editorFrom(automation, me.timezone);
    const check: AutomationCheck = {
      ok: false,
      kind: "repeat",
      nextRuns: [],
      problems: [{ step: "steps", stepId: "send", code: "invalid", message: "Step 4: Gmail is not connected. Connect it under Integrations, Apps." }],
    };
    qc.setQueryData(qk.automationCheck(partsKey(start), automation.id), check);
    const words = text(draw(qc, createElement(AutomationScreen, { automationId: automation.id, editing: true })));
    expect(words).toContain("4 of 6 steps, done one at a time, in order.");
    expect(words).toContain("Step 2 · Tex");
    expect(words).toContain("only if: mentions “urgent”");
    expect(words).toContain("+ Add a step");
    expect(words).toContain("Step 4: Gmail is not connected.");
    expect(words).toContain("Back to one instruction");
    expect(words).toContain("Purpose");
  });

  it("at 6 steps the button says so", async () => {
    const qc = await seeded();
    const automation = await priyaSaved();
    const full = { ...automation };
    let steps = editorFrom(automation, "UTC").steps;
    steps = insertStep(insertStep(steps, 4, emptyStep("tex", "five")), 5, emptyStep("tex", "six"));
    full.steps = toParts({ ...editorFrom(automation, "UTC"), steps }).steps!.map((step) => ({
      id: step.id!,
      type: step.type,
      title: step.title ?? "A step",
      app: step.app ?? null,
      action: step.action ?? null,
      inputs: step.inputs ?? {},
      instruction: step.instruction ?? null,
      readApps: step.readApps ?? [],
      askFirst: step.askFirst ?? false,
      onlyIf: step.onlyIf ?? { kind: "always" },
      showResult: step.showResult ?? false,
      risky: step.id === "send",
    }));
    qc.setQueryData(qk.automation(full.id), full);
    const words = text(draw(qc, createElement(AutomationScreen, { automationId: full.id, editing: true })));
    expect(words).toContain("6 of 6 steps");
    expect(words).toContain("Up to 6 steps");
    expect(words).not.toContain("+ Add a step");
  });
});

describe("an automation's page after a run", () => {
  it("says how the last run went, and each step's mark in the list", async () => {
    const qc = await seeded();
    const automation = await priyaSaved();
    qc.setQueryData(qk.automation(automation.id), automation);
    await call("POST", `automations/${automation.id}/run`, { clientRequestId: crypto.randomUUID() });
    await vi.runAllTimersAsync();
    qc.setQueryData(qk.automationRuns(automation.id), (await call("GET", `automations/${automation.id}/runs`)).body);
    const words = text(draw(qc, createElement(AutomationScreen, { automationId: automation.id })));
    expect(words).toContain("Last test run, just now: waiting for your OK on step 4.");
    expect(words).toContain("Last run: Done");
    expect(words).toContain("Last run: Waiting for your OK");
  });
});

describe("the canvas", () => {
  it("has a “+” on each arrow, greyed at 6, and an exit beside each step with an “only if”", async () => {
    const automation = await priyaSaved();
    const flow = automationFlow(automation, "UTC", NOW);
    const props = { steps: flow, kind: automation.kind, selected: "trigger", panelId: "p", onSelect: () => {}, editing: true, onInsert: () => {}, direction: "across" as const };
    const four = stepsElements({ ...props, count: 4 });
    expect(four.nodes.filter((node) => node.type === "exit")).toHaveLength(2);
    expect(four.edges.filter((edge) => edge.data?.insertAt !== null).every((edge) => edge.data?.canAdd)).toBe(true);
    const six = stepsElements({ ...props, count: 6 });
    expect(six.edges.some((edge) => edge.data?.canAdd)).toBe(false);
  });

  it("dagre and the steps canvas are loaded only as the canvas's own chunk", () => {
    const root = join(process.cwd(), "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(root);
    const importers = (pattern: RegExp) => files.filter((file) => pattern.test(readFileSync(file, "utf8"))).map((file) => file.slice(root.length + 1));
    expect(importers(/from "@dagrejs\/dagre"/)).toEqual(["lib/step-layout.ts"]);
    expect(importers(/from "@\/lib\/step-layout"|from "\.\/step-layout"/)).toEqual(["components/automations/steps-canvas.tsx"]);
    // The steps canvas only through next/dynamic, never a static import.
    expect(importers(/from "\.\/steps-canvas"|from "@\/components\/automations\/steps-canvas"/)).toEqual([]);
    expect(importers(/import\("\.\/steps-canvas"\)/).sort()).toEqual(["components/automations/automation-editor.tsx", "components/automations/flow-view.tsx"]);
  });
});
