import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// The canvas (React Flow), drawn as a graph: the boxes it draws from what the builder gives it, each
// in its kind's colour with its ports, a step's "only if" as a condition box with "Yes", "No" and a
// Stop, React Flow's own label hidden, and the library loaded only as the canvas's own chunk. (Clicking
// the boxes, the "+" and the × is in lane-canvas-clicks.test.ts.)

import LaneCanvas, { type LaneCanvasProps } from "@/components/automations/lane-canvas";
import { laneDiagram } from "@/lib/automation-lanes";

function canvasProps(over: Partial<LaneCanvasProps> = {}): LaneCanvasProps {
  const diagram = laneDiagram([{ id: "r" }, { id: "t" }], ["read", "tex"]);
  return {
    diagram,
    boxes: new Map([
      ["trigger", { key: "trigger", logo: "schedule", label: "Schedule", title: "Every day at 9:00 AM", line: "Schedule · starts each run", chips: [{ text: "Your time, Asia/Kolkata" }] }],
      [
        "step:r",
        {
          key: "step:r",
          logo: "gmail",
          label: "Step 1 · Gmail",
          title: "Fetch emails",
          line: "Step 1 · Reads from Gmail",
          removable: true,
          chips: [{ text: "is:unread", mono: true }, { text: "Connect Gmail", tone: "warn" }],
        },
      ],
      ["step:t", { key: "step:t", logo: "tex", label: "Step 2 · Tex", title: "Sum them up", line: "Step 2 · Tex", problem: "Step 2: write what Tex does in this step." }],
    ]),
    empties: new Map([["empty:write", { key: "empty:write", lane: "write", title: "Writing skipped", line: "Tex only tells you, in the Automations chat.", action: "Add a write step" }]]),
    results: { title: "Automations chat", line: "Where each run answers" },
    heads: diagram.heads.map((head) => ({ before: head.before, text: head.lane, ...(head.skip ? { skip: "Skip reading" } : {}) })),
    conditions: new Map(),
    selected: "step:t",
    count: 2,
    editing: true,
    compact: false,
    dragging: null,
    onSelect: () => {},
    onRemove: () => {},
    onSkip: () => {},
    onPlus: () => {},
    onDrop: () => {},
    onDropTrigger: () => {},
    label: "Morning email, step by step",
    ...over,
  };
}

const ONLY_IF = { text: "Only if the step before found something", title: "Only if: found something", line: "Otherwise the run stops here", warn: false };

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** The opening tag of the element whose aria-label starts so. */
const tagOf = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}`);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf(">", at) + 1);
};

describe("the canvas", () => {
  it("draws each box with its tile, name, line and chips, top to bottom, the open one pressed", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, canvasProps()));
    const words = text(html);
    const order = ["Every day at 9:00 AM", "Fetch emails", "Sum them up", "Writing skipped", "Automations chat"].map((part) => words.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(words).toContain("Step 1 · Reads from Gmail");
    expect(words).toContain("Your time, Asia/Kolkata");
    expect(html).toContain('aria-label="Step 2 · Tex: Sum them up. To fix: Step 2: write what Tex does in this step."');
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    // A fixed input is a read-only chip in mono; an app to connect is an amber chip; the step's problem shows in amber.
    expect(html).toMatch(/font-mono"[^>]*>(<[^>]+>)*<span class="truncate">is:unread/);
    expect(html).toMatch(/bg-warn-soft[^"]*"[^>]*>(<[^>]+>)*<span class="truncate">Connect Gmail/);
    expect(tagOf(html, "Step 2 · Tex")).toContain('data-problem="true"');
    expect(words).toContain("Add a write step");
    expect(words).toContain("Skip reading");
    expect(html).toContain('aria-label="Remove Fetch emails"');
    // A line between each two boxes, drawn from the first paint, each with its arrowhead.
    expect(html.match(/class="react-flow__edge-path"/g)?.length).toBe(4);
    expect(html.match(/class="graph-arrow"/g)?.length).toBe(4);
    // React Flow's own label is hidden by its own option.
    expect(html).not.toContain("React Flow");
  });

  it("colours each box by its kind, gives it a tile, and puts its ports on its edges", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, canvasProps()));
    expect(tagOf(html, "Schedule: Every day")).toContain('data-kind="trigger"');
    expect(tagOf(html, "Step 1 · Gmail")).toContain('data-kind="read"');
    expect(tagOf(html, "Step 2 · Tex")).toContain('data-kind="tex"');
    expect(tagOf(html, "Results: Automations chat")).toContain('data-kind="end"');
    expect(html).toMatch(/data-kind="write"[^>]*class="empty-node/);
    for (const label of ["Schedule: Every day", "Step 1 · Gmail", "Step 2 · Tex", "Results: Automations chat"]) expect(tagOf(html, label)).toContain("graph-node");
    expect(html).toContain("graph-tile");
    // The trigger has a port at its foot only, the results at their top only, a step at both.
    const ports = (label: string) => {
      const start = html.indexOf(`aria-label="${label}`);
      const end = html.indexOf('class="react-flow__node ', start);
      const own = html.slice(start, end === -1 ? undefined : end);
      return { top: own.includes("react-flow__handle-top"), bottom: own.includes("react-flow__handle-bottom"), dots: (own.match(/graph-port/g) ?? []).length };
    };
    expect(ports("Schedule: Every day")).toEqual({ top: false, bottom: true, dots: 1 });
    expect(ports("Step 1 · Gmail")).toEqual({ top: true, bottom: true, dots: 2 });
    expect(ports("Results: Automations chat")).toEqual({ top: true, bottom: false, dots: 1 });
  });

  it("draws an 'only if' as a condition box on the line into its step: Yes to the step, No to a Stop", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, canvasProps({ conditions: new Map([["step:t", ONLY_IF]]) })));
    const words = text(html);
    const condition = tagOf(html, "Only if the step before found something");
    expect(condition).toContain('data-kind="cond"');
    expect(condition).toContain('role="button"');
    expect(words).toContain("Only if: found something");
    expect(words).toContain("Otherwise the run stops here");
    // The condition sits between the step before and its step, on the centre line; the Stop to its right.
    const at = (label: string) => {
      const wrapper = html.slice(html.lastIndexOf('class="react-flow__node ', html.indexOf(`aria-label="${label}`)));
      const [, x, y] = wrapper.match(/translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)/) ?? [];
      return { x: Number(x), y: Number(y) };
    };
    expect(at("Step 1 · Gmail").y).toBeLessThan(at("Only if the step before").y);
    expect(at("Only if the step before").y).toBeLessThan(at("Step 2 · Tex").y);
    expect(at("Only if the step before").x).toBe(at("Step 2 · Tex").x);
    expect(at("Stop:").x).toBeGreaterThan(at("Step 2 · Tex").x);
    // "Yes" and "No" on its two lines, and the Stop, grey.
    expect(html).toMatch(/<text[^>]*>Yes<\/text>/);
    expect(html).toMatch(/<text[^>]*>No<\/text>/);
    expect(tagOf(html, "Stop:")).toContain('data-kind="end"');
    expect(words).toContain("Stop");
    // Two lines more: the step before to the condition, Yes to the step, No to the Stop.
    expect(html.match(/class="react-flow__edge-path"/g)?.length).toBe(6);
    // A condition that now looks at another step says so, in amber.
    const warned = renderToStaticMarkup(createElement(LaneCanvas, canvasProps({ conditions: new Map([["step:t", { ...ONLY_IF, warn: true }]]) })));
    expect(tagOf(warned, "Only if the step before")).toContain('data-problem="true"');
    expect(text(warned)).toContain("Check it: the step before it changed");
  });

  it("on a phone keeps the Stop under the condition, its port at the condition's foot", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, canvasProps({ compact: true, conditions: new Map([["step:t", ONLY_IF]]) })));
    const condition = html.slice(html.indexOf('aria-label="Only if the step before'), html.indexOf('aria-label="Stop:'));
    expect(condition).not.toContain("react-flow__handle-right");
    expect(condition.match(/react-flow__handle-bottom/g)?.length).toBe(2);
    expect(text(html)).not.toContain("Skips the rest");
  });

  it("offers no ×, no skip and no 'Add a … step' when it can't be changed", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, canvasProps({ editing: false })));
    expect(html).not.toContain("Remove Fetch emails");
    expect(text(html)).not.toContain("Skip reading");
    expect(text(html)).not.toContain("Add a write step");
  });

  it("fades the places a dragged block can't go and lights its own lane", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, canvasProps({ dragging: "write" })));
    // The empty write lane takes it; the boxes fade.
    expect(html).toMatch(/bg-accent-soft outline-accent/);
    expect(html).toContain("opacity-40");
  });
});

describe("its chunk", () => {
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

  it("React Flow and the canvas's layout are loaded only by the canvas, and the canvas only through next/dynamic", () => {
    expect(importers(/from "@xyflow\/react"/)).toEqual(["components/automations/lane-canvas.tsx"]);
    expect(importers(/from "@\/lib\/lane-layout"/)).toEqual(["components/automations/lane-canvas.tsx"]);
    // Only its types are imported elsewhere; the component itself comes through next/dynamic.
    expect(importers(/^import (?!type )[^;]*from "\.\/lane-canvas"/m)).toEqual([]);
    expect(importers(/import\("\.\/lane-canvas"\)/).sort()).toEqual(["components/automations/builder.tsx", "components/automations/review-builder.tsx"]);
  });

  it("lets every box take a click: React Flow switches pointer events off on nodes that are not selectable", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, canvasProps({ conditions: new Map([["step:t", ONLY_IF]]) })));
    for (const name of ["Schedule: Every day", "Step 1 · Gmail: Fetch emails", "Step 2 · Tex: Sum them up", "Results: Automations chat", "Only if the step before", "Stop:"]) {
      expect(tagOf(html, name)).toContain("pointer-events-auto");
    }
    expect(html).toMatch(/class="empty-node pointer-events-auto/);
  });
});
