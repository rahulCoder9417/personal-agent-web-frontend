import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Brand } from "@/components/shell/brand";
import { AuthFrame } from "./auth-frame";

const draw = () => renderToStaticMarkup(createElement(AuthFrame, null, createElement("form", { id: "the-form" })));
const tag = (html: string, name: string) => new RegExp(`<${name}[^>]*>`).exec(html)?.[0] ?? "";
const classes = (element: string) => (/class="([^"]*)"/.exec(element)?.[1] ?? "").replaceAll("&amp;", "&").split(" ");
const style = (element: string) => (/style="([^"]*)"/.exec(element)?.[1] ?? "").replaceAll("&quot;", '"');
// The wrappers of the example job and of the crew's row: decoration, hidden from screen readers.
const exampleJob = (html: string) => /<div aria-hidden="true" class="([^"]*)"><div[^>]*>(?:(?!<\/aside>)[\s\S])*Waiting for your OK/.exec(html)?.[1];
const crewRow = (html: string) => /<div aria-hidden="true" class="([^"]*)"><ul/.exec(html)?.[1];

describe("AuthFrame on a wide screen", () => {
  it("gives the brand panel exactly half the width, edge to edge, and only from 1024px", () => {
    const panel = classes(tag(draw(), "aside"));
    expect(panel).toEqual(expect.arrayContaining(["hidden", "lg:flex", "w-1/2", "shrink-0"]));
    // Not a box inset in the page: no margin and no rounded corners.
    expect(panel.filter((name) => /^(m[trblxy]?-|rounded)/.test(name))).toEqual([]);
  });

  it("paints the panel in Tex's blue from the design tokens, not colours of its own", () => {
    const paint = style(tag(draw(), "aside"));
    expect(paint).toContain("var(--accent)");
    expect(paint).toContain("var(--accent-dark)");
    expect(paint).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("centres the form in the right half, at a comfortable width", () => {
    const html = draw();
    const column = /<div class="([^"]*)"><form id="the-form">/.exec(html)?.[1].split(" ") ?? [];
    expect(column).toEqual(expect.arrayContaining(["m-auto", "w-full", "max-w-[400px]"]));
    expect(classes(tag(html, "main"))).toEqual(expect.arrayContaining(["flex-1", "overflow-y-auto"]));
  });

  it("reads out the headline and the line under it; the example job and the crew are decoration", () => {
    const html = draw();
    expect(html).toMatch(/<h2[^>]*>Got a lot of work\?<br\/>Just text your crew\.<\/h2>/);
    expect(exampleJob(html)).toBeDefined();
    expect(crewRow(html)).toBeDefined();
  });

  it("leaves out the example job and then the crew as the window gets shorter, rather than cutting them off", () => {
    const html = draw();
    expect(exampleJob(html)).toContain("[@media(max-height:620px)]:hidden");
    const crew = crewRow(html) ?? "";
    expect(crew).toContain("[@media(max-height:480px)]:hidden");
    // The figures give way before anything is cut: the row may shrink, down to a floor.
    expect(crew).toContain("min-h-[140px]");
    expect(classes(tag(html, "aside"))).toContain("overflow-hidden");
  });

  it("has the crew stand in a row, each with its name and what it does", () => {
    const html = draw();
    for (const [name, role] of [
      ["Tex", "captain"],
      ["Byte", "code"],
      ["Patch", "code review"],
      ["Scout", "research"],
    ]) {
      expect(html).toContain(`>${name}</span><span class="text-white/65">${role}</span>`);
    }
  });
});

describe("AuthFrame on a phone", () => {
  it("has a compact header with the lockup and the crew's faces, hidden once the panel shows", () => {
    const header = draw().match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(classes(tag(header, "header"))).toEqual(expect.arrayContaining(["lg:hidden", "h-14"]));
    expect(header).toContain("textcrew");
    expect(header.match(/rounded-full ring-2 ring-surface/g)).toHaveLength(4);
  });
});

describe("Brand", () => {
  it("draws the lockup in ink with the blue cursor by default", () => {
    const html = renderToStaticMarkup(createElement(Brand));
    expect(html).toContain("bg-accent");
    expect(html).not.toContain("bg-surface");
    expect(html).not.toContain("text-white");
  });

  it("puts Tex's face on a white tile and whitens the words on the brand blue", () => {
    const html = renderToStaticMarkup(createElement(Brand, { onColour: true }));
    expect(classes(tag(html, "a"))).toContain("text-white");
    expect(html).toMatch(/<span class="[^"]*bg-surface[^"]*"><svg/);
    expect(html).toMatch(/brand-caret[^"]*bg-surface/);
  });
});
