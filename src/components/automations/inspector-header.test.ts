// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The settings' header always shows in full (kind line, name, chip; 16px of room above, a clean
// 1px line below, nothing pulling it up), and the canvas carries no "React Flow" label.

import { HealthChip, InspectorHeader } from "@/components/automations/inspector";

describe("settings header", () => {
  const html = renderToStaticMarkup(
    createElement(InspectorHeader, { kind: "write", logo: "gmail", label: "Step 3 · Writes in Google Docs", title: "Create Google Doc with PR summary that has a long name", status: createElement(HealthChip, { health: "ok" }) }),
  );

  it("shows the kind, the name and the Connected chip", () => {
    expect(html).toContain("Step 3 · Writes in Google Docs");
    expect(html).toContain("Create Google Doc with PR summary");
    expect(html).toContain("Connected");
  });

  it("has 16px on top, a 1px soft line below, and no offset that could clip it", () => {
    const cls = /<header[^>]*class="([^"]*)"/.exec(html)![1]!;
    expect(cls).toContain("pt-4");
    expect(cls).toContain("border-b");
    expect(cls).toContain("border-fg/10");
    expect(cls).toContain("bg-surface");
    expect(cls).not.toMatch(/(^|\s)-?m[tb]?-|-top-|top-\[-/);
  });
});

describe("canvas attribution", () => {
  it("asks React Flow to hide its label with its own option", () => {
    const source = readFileSync("src/components/automations/lane-canvas.tsx", "utf8");
    expect(source).toContain("proOptions={{ hideAttribution: true }}");
    expect(source).not.toContain("react-flow__attribution");
  });
});
