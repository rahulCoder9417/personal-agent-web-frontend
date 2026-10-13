import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidePanel, SidePanelReopen } from "./side-panel";

const tag = (html: string, pattern: RegExp) => pattern.exec(html)?.[0] ?? "";
const classes = (element: string) => (/class="([^"]*)"/.exec(element)?.[1] ?? "").split(" ");
const panel = (html: string) => tag(html, /<aside[^>]*>/);
const button = (html: string, label: string) => tag(html, new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`));

describe("SidePanel", () => {
  it("has a button that folds it away, saying what it does and what it folds", () => {
    const html = renderToStaticMarkup(createElement(SidePanel, { motion: true }));
    expect(panel(html)).toContain('id="side-panel"');
    expect(panel(html)).toContain('aria-label="Right now"');
    expect(panel(html)).not.toMatch(/\binert\b/);
    const hide = button(html, "Hide side panel");
    expect(hide).toContain('aria-controls="side-panel"');
    expect(hide).toContain('aria-expanded="true"');
    expect(hide).toContain('id="side-panel-hide"');
  });

  it("is inert and hidden from screen readers once folded away", () => {
    const html = renderToStaticMarkup(createElement(SidePanel, { hidden: true, motion: true }));
    expect(panel(html)).toContain('inert=""');
    expect(panel(html)).toContain('aria-hidden="true"');
    expect(classes(panel(html))).toEqual(expect.arrayContaining(["w-0", "invisible"]));
  });

  it("folds where there is no room for it, rather than jumping out of the page", () => {
    expect(classes(panel(renderToStaticMarkup(createElement(SidePanel))))).toEqual(expect.arrayContaining(["max-[1100px]:w-0", "max-[1100px]:invisible"]));
    expect(classes(panel(renderToStaticMarkup(createElement(SidePanel, { besideChats: true }))))).toEqual(
      expect.arrayContaining(["max-[1340px]:w-0", "max-[1340px]:invisible"]),
    );
  });

  it("doesn't draw what it shows until the browser has said there is room, so a phone never asks for it", () => {
    const html = renderToStaticMarkup(createElement(SidePanel));
    expect(html).not.toContain("Needs your OK");
  });
});

describe("SidePanelReopen", () => {
  const draw = (hidden: boolean, besideChats = false) =>
    renderToStaticMarkup(createElement(SidePanelReopen, { hidden, besideChats, motion: true, onShow: () => {} }));

  it("is in the header only while the panel is folded away and there is room for it", () => {
    const wrapper = (html: string) => classes(tag(html, /<span[^>]*>/));
    expect(wrapper(draw(false))).toEqual(expect.arrayContaining(["invisible", "max-w-0", "opacity-0"]));
    expect(wrapper(draw(false)).some((name) => name.startsWith("min-["))).toBe(false);
    expect(wrapper(draw(true))).toEqual(expect.arrayContaining(["min-[1100px]:visible", "min-[1100px]:max-w-9", "min-[1100px]:opacity-100"]));
    expect(wrapper(draw(true, true))).toEqual(expect.arrayContaining(["min-[1340px]:visible", "min-[1340px]:max-w-9"]));
    expect(wrapper(draw(true))).toContain("motion-reduce:transition-none");
  });

  it("says what it does and what it opens", () => {
    const show = button(draw(true), "Show side panel");
    expect(show).toContain('aria-controls="side-panel"');
    expect(show).toContain('aria-expanded="false"');
    expect(show).toContain('id="side-panel-show"');
  });
});
