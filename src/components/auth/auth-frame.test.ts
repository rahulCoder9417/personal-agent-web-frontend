import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Brand } from "@/components/shell/brand";
import { AUTH_LOOK, AuthFrame, type AuthLook } from "./auth-frame";

const draw = (look?: AuthLook) => renderToStaticMarkup(createElement(AuthFrame, { look, children: createElement("form", { id: "the-form" }) }));
const tag = (html: string, name: string) => new RegExp(`<${name}[^>]*>`).exec(html)?.[0] ?? "";
const classes = (element: string) => (/class="([^"]*)"/.exec(element)?.[1] ?? "").replaceAll("&amp;", "&").split(" ");
const styles = (html: string) => [...html.matchAll(/style="([^"]*)"/g)].map((match) => match[1].replaceAll("&quot;", '"')).join(" ");
/** The classes of the element that holds the form. */
const formColumn = (html: string) => /<div class="([^"]*)"><form id="the-form">/.exec(html)?.[1].split(" ") ?? [];

describe("AuthFrame", () => {
  it("wears the chosen look by default", () => {
    expect(AUTH_LOOK).toBe("aurora");
    expect(draw()).toBe(draw(AUTH_LOOK));
  });
});

describe("the aurora look", () => {
  const html = draw("aurora");

  it("centres the form at a comfortable width, in a page that scrolls rather than cutting anything off", () => {
    expect(formColumn(html)).toEqual(expect.arrayContaining(["mx-auto", "w-full", "max-w-[400px]"]));
    expect(classes(tag(html, "div"))).toEqual(expect.arrayContaining(["h-dvh", "overflow-y-auto"]));
    expect(classes(tag(html, "main"))).toContain("flex-1");
  });

  it("paints the sky in the crew's colours from the design tokens, not colours of its own", () => {
    const paint = styles(html);
    for (const token of ["--accent-dark", "--screen", "--accent", "--byte", "--patch", "--scout"]) expect(paint).toContain(`var(${token})`);
    expect(paint).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("has the whole page as the sky on a wide screen, and a band of it above the form on a phone", () => {
    const skies = [...html.matchAll(/<div aria-hidden="true" class="([^"]*overflow-hidden[^"]*)" style="background:color-mix/g)].map((match) => match[1].split(" "));
    expect(skies).toHaveLength(2);
    expect(skies[0]).toEqual(expect.arrayContaining(["fixed", "inset-0", "hidden", "lg:block"]));
    expect(skies[1]).toEqual(expect.arrayContaining(["absolute", "inset-0"]));
    // The band holds the lockup and the line, and is hidden once the whole page is the sky.
    const band = /<div class="([^"]*)"><div aria-hidden="true" class="[^"]*absolute inset-0/.exec(html)?.[1].split(" ") ?? [];
    expect(band).toEqual(expect.arrayContaining(["lg:hidden"]));
  });

  it("puts the form on a white card on a wide screen and a white sheet on a phone", () => {
    const card = /<div class="([^"]*)"><div aria-hidden="true" class="pointer-events-none/.exec(html)?.[1].split(" ") ?? [];
    expect(card).toEqual(expect.arrayContaining(["bg-surface", "rounded-t-[28px]", "lg:rounded-[24px]", "lg:w-[440px]"]));
  });

  it("reads out the headline and the line under it; the sky, the example job and the crew are decoration", () => {
    expect(html).toMatch(/<h2[^>]*>Got a lot of work\?<br\/>Just text <span[^>]*>your crew\.<\/span><\/h2>/);
    expect(html).toContain("hands each part to the right specialist");
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*"><div[^>]*backdrop-blur-xl[^>]*>(?:(?!<\/section>)[\s\S])*Waiting for your OK/);
    // The crew looking over the card, and their hands on its edge: on a phone and on a wide screen.
    const crew = [...html.matchAll(/<div aria-hidden="true" class="pointer-events-none flex justify-center ([^"]*)"/g)].map((match) => match[1]);
    expect(crew).toHaveLength(4);
    expect(html.match(/aria-label=""/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("leaves out the example job and then the crew as the window gets shorter, rather than cutting them off", () => {
    expect(html).toMatch(/<div aria-hidden="true" class="\[@media\(max-height:700px\)\]:hidden"><div[^>]*backdrop-blur-xl/);
    const wide = [...html.matchAll(/class="pointer-events-none flex justify-center [^"]*hidden lg:flex ([^"]*)"/g)].map((match) => match[1]);
    expect(wide).toEqual(["[@media(max-height:640px)]:lg:hidden", "[@media(max-height:640px)]:lg:hidden"]);
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
