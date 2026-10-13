import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FoldingPane } from "./folding-pane";

type Props = ComponentProps<typeof FoldingPane>;
const draw = (props: Partial<Props>) =>
  renderToStaticMarkup(
    createElement(
      FoldingPane,
      { id: "chat-history", label: "Chat history", side: "left", width: "w-[264px]", open: true, motion: true, ...props } as Props,
      createElement("button", null, "New chat"),
    ),
  );
const pane = (html: string) => /^<aside[^>]*>/.exec(html)?.[0] ?? "";
const inside = (html: string) => /^<aside[^>]*><div[^>]*>/.exec(html)?.[0].replace(/^<aside[^>]*>/, "") ?? "";
const classes = (tag: string) => (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ");

describe("FoldingPane", () => {
  it("is open: its width, reachable, and named for screen readers", () => {
    const html = draw({ open: true });
    expect(pane(html)).not.toMatch(/\binert\b/);
    expect(pane(html)).not.toContain("aria-hidden");
    expect(pane(html)).toContain('aria-label="Chat history"');
    expect(classes(pane(html))).toContain("w-[264px]");
    expect(classes(pane(html))).not.toContain("invisible");
    expect(html).toContain("New chat");
  });

  it("is folded: no width, inert and hidden from screen readers, while what is in it stays drawn", () => {
    const html = draw({ open: false });
    expect(pane(html)).toContain('inert=""');
    expect(pane(html)).toContain('aria-hidden="true"');
    expect(classes(pane(html))).toEqual(expect.arrayContaining(["w-0", "invisible"]));
    expect(classes(inside(html))).toEqual(expect.arrayContaining(["opacity-0", "-translate-x-3"]));
    // What is inside keeps its width, so nothing wraps afresh as it moves.
    expect(classes(inside(html))).toContain("w-[264px]");
    expect(html).toContain("New chat");
  });

  it("slides its contents out with the edge that moves", () => {
    expect(classes(pane(draw({ side: "left" })))).toContain("justify-end");
    expect(classes(pane(draw({ side: "right" })))).toContain("justify-start");
    expect(classes(inside(draw({ side: "right", open: false })))).toContain("translate-x-3");
  });

  it("moves only once the page has been drawn, and never for someone who asked for less motion", () => {
    const moving = draw({ motion: true });
    expect(classes(pane(moving))).toEqual(expect.arrayContaining(["transition-[width,visibility]", "duration-[225ms]", "motion-reduce:transition-none"]));
    expect(classes(inside(moving))).toEqual(expect.arrayContaining(["transition-[opacity,translate]", "motion-reduce:transition-none"]));
    const still = draw({ motion: false });
    expect(pane(still)).not.toContain("transition-");
    expect(inside(still)).not.toContain("transition-");
  });
});

describe("the phone's drawer", () => {
  const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

  it("slides out as well as in, staying on screen until it has gone", () => {
    expect(css).toMatch(/\.drawer \{[^}]*translate: -100% 0;[^}]*display 180ms allow-discrete[^}]*overlay 180ms allow-discrete/);
    expect(css).toMatch(/@starting-style \{\s*\.drawer\[open\] \{\s*translate: -100% 0;/);
    expect(css).toMatch(/\.drawer\[open\]::backdrop \{\s*background-color: color-mix/);
  });

  it("doesn't slide for someone who asked for less motion", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(reduced).toMatch(/\.drawer,\s*\.drawer::backdrop \{ transition: none; \}/);
  });
});
