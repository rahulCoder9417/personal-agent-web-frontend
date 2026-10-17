import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// The canvas (React Flow): the boxes it draws from what the builder gives it, with React Flow's
// own link kept, and the library loaded only as the canvas's own chunk.

import LaneCanvas, { type LaneCanvasProps } from "@/components/automations/lane-canvas";
import { laneDiagram } from "@/lib/automation-lanes";

function props(over: Partial<LaneCanvasProps> = {}): LaneCanvasProps {
  const diagram = laneDiagram([{ id: "r" }, { id: "t" }], ["read", "tex"]);
  return {
    diagram,
    boxes: new Map([
      ["trigger", { key: "trigger", logo: "schedule", label: "Schedule", title: "Every day at 9:00 AM", line: "Your time, Asia/Kolkata" }],
      ["step:r", { key: "step:r", logo: "gmail", label: "Step 1 · Gmail", title: "Fetch emails", line: "query: is:unread", removable: true, chips: [{ text: "Connect Gmail", tone: "warn" }] }],
      ["step:t", { key: "step:t", logo: "tex", label: "Step 2 · Tex", title: "Sum them up", problem: "Step 2: write what Tex does in this step." }],
    ]),
    empties: new Map([["empty:write", { key: "empty:write", lane: "write", title: "Writing skipped", line: "Tex only tells you, in the Automations chat.", action: "Add a write step" }]]),
    results: { title: "Automations chat", line: "Results go to" },
    heads: diagram.heads.map((head) => ({ before: head.before, text: head.lane.toUpperCase(), ...(head.skip ? { skip: "Skip reading" } : {}) })),
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

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the canvas", () => {
  it("draws each box with its mark, name and line, top to bottom, the open one pressed", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, props()));
    const words = text(html);
    const order = ["Every day at 9:00 AM", "Fetch emails", "Sum them up", "Writing skipped", "Automations chat"].map((part) => words.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('aria-label="Step 2 · Tex: Sum them up. To fix: Step 2: write what Tex does in this step."');
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    // An app to connect is an amber chip; the step's problem is in amber too.
    expect(html).toContain("Connect Gmail");
    expect(html).toMatch(/bg-warn-soft[^"]*"[^>]*>(<[^>]+>)*<span class="truncate">Connect Gmail/);
    expect(words).toContain("Add a write step");
    expect(words).toContain("Skip reading");
    expect(html).toContain('aria-label="Remove Fetch emails"');
    // A line between each two boxes, drawn from the first paint (each box says where its lines meet it).
    expect(html.match(/class="react-flow__edge-path"/g)?.length).toBe(4);
    // React Flow's own link stays.
    expect(html).toContain("React Flow");
  });

  it("offers no ×, no skip and no 'Add a … step' when it can't be changed", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, props({ editing: false })));
    expect(html).not.toContain("Remove Fetch emails");
    expect(text(html)).not.toContain("Skip reading");
    expect(text(html)).not.toContain("Add a write step");
  });

  it("fades the places a dragged block can't go and lights its own lane", () => {
    const html = renderToStaticMarkup(createElement(LaneCanvas, props({ dragging: "write" })));
    // The empty write lane takes it; the boxes fade.
    expect(html).toMatch(/border-accent bg-accent-soft/);
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
    const html = renderToStaticMarkup(createElement(LaneCanvas, props()));
    const root = (open: string) => html.slice(html.lastIndexOf("<", html.indexOf(open)));
    for (const name of ["Schedule: Every day", "Step 1 · Gmail: Fetch emails", "Step 2 · Tex: Sum them up", "Results go to Automations chat"]) {
      const tag = root(`aria-label="${name}`);
      expect(tag.slice(0, tag.indexOf(">"))).toContain("pointer-events-auto");
    }
    const empty = html.slice(html.lastIndexOf("border-dashed", html.indexOf("Writing skipped")) - 200, html.indexOf("Writing skipped"));
    expect(empty).toContain("pointer-events-auto");
  });
});
