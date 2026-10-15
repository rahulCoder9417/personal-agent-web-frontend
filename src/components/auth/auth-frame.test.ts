import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Brand } from "@/components/shell/brand";
import { AUTH_LOOK, AuthFrame, type AuthLook } from "./auth-frame";

// The form goes in as createElement's third argument; the props' type wants it among the props.
const draw = (look?: AuthLook) => renderToStaticMarkup(createElement(AuthFrame, { look } as ComponentProps<typeof AuthFrame>, createElement("form", { id: "the-form" })));
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

describe("the chat-wall look", () => {
  const html = draw("chat-wall");

  it("gives the dark panel exactly half the width, edge to edge, and only from 1024px", () => {
    const panel = classes(tag(html, "aside"));
    expect(panel).toEqual(expect.arrayContaining(["hidden", "lg:flex", "w-1/2", "shrink-0", "overflow-hidden"]));
    expect(panel.filter((name) => /^(m[trblxy]?-|rounded)/.test(name))).toEqual([]);
  });

  it("centres the form at a comfortable width, on a white sheet on the warm paper of the right half", () => {
    const sheet = /<div class="([^"]*)"><div class="mx-auto w-full max-w-\[400px\]"><form id="the-form">/.exec(html)?.[1].split(" ") ?? [];
    expect(sheet).toEqual(expect.arrayContaining(["lg:my-auto", "lg:bg-surface", "lg:rounded-[24px]", "lg:border"]));
    expect(classes(tag(html, "main"))).toEqual(expect.arrayContaining(["flex-1", "lg:overflow-y-auto"]));
    expect(styles(tag(html, "div"))).toContain("background-color:var(--surface-2)");
  });

  it("paints everything from the design tokens, not colours of its own", () => {
    const paint = styles(html);
    for (const token of ["--accent-dark", "--screen", "--surface-2", "--fg", "--accent", "--byte", "--patch", "--scout"]) expect(paint).toContain(`var(${token})`);
    expect(paint).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("reads out the headline and the line under it; the wall of chats and the crew are decoration", () => {
    expect(html).toMatch(/<h2[^>]*>Got a lot of work\?<br\/>Just text <span>your crew\.<\/span><\/h2>/);
    expect(html).toContain("hands each part to the right specialist");
    const walls = [...html.matchAll(/<div aria-hidden="true" class="pointer-events-none absolute flex gap-4[^"]*"[^>]*>/g)];
    expect(walls).toHaveLength(2);
    expect(html).toContain("Find flights to Goa under ₹8k");
    expect(html).toMatch(/<div aria-hidden="true" class="relative mt-auto[^"]*"><span/);
  });

  it("has the crew stand in front of the wall, each with its name and what it does", () => {
    for (const [name, role] of [
      ["Tex", "captain"],
      ["Byte", "code"],
      ["Patch", "code review"],
      ["Scout", "research"],
    ]) {
      expect(html).toContain(`>${name}</span><span class="text-white/60">${role}</span>`);
    }
  });

  it("leaves out the crew in a very short window, rather than cutting it off", () => {
    expect(html).toMatch(/<div aria-hidden="true" class="relative mt-auto [^"]*\[@media\(max-height:560px\)\]:hidden"/);
  });

  it("has a band of the wall on a phone, with the lockup and the crew's faces, hidden once the panel shows", () => {
    const band = /<div class="([^"]*)" style="background:color-mix[^"]*"><div aria-hidden="true" class="pointer-events-none absolute/.exec(html)?.[1].split(" ") ?? [];
    expect(band).toEqual(expect.arrayContaining(["lg:hidden", "h-[132px]", "overflow-hidden"]));
    const faces = html.slice(0, html.indexOf("<aside")).match(/class="grid shrink-0 place-items-center rounded-full ring-2"/g);
    expect(faces).toHaveLength(4);
  });
});

describe("the landing look", () => {
  const html = draw("landing");

  it("draws the form once, centred at a comfortable width, in a page that scrolls rather than cutting anything off", () => {
    expect(html.match(/<form id="the-form">/g)).toHaveLength(1);
    expect(formColumn(html)).toEqual(expect.arrayContaining(["mx-auto", "w-full", "max-w-[400px]"]));
    expect(classes(tag(html, "div"))).toEqual(expect.arrayContaining(["h-dvh", "overflow-y-auto"]));
  });

  it("is on textcrew.in's page colour, from the design tokens", () => {
    const paint = styles(html);
    expect(paint).toContain("background:color-mix(in srgb, var(--bg) 40%, var(--surface))");
    expect(paint).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("puts the form on a white card on a wide screen and a white sheet on a phone, the crew standing on its edge", () => {
    const card = /<div class="([^"]*)"><div aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-full/.exec(html)?.[1].split(" ") ?? [];
    expect(card).toEqual(expect.arrayContaining(["bg-surface", "rounded-t-[28px]", "lg:rounded-[28px]", "lg:border", "lg:w-[440px]"]));
    const crews = [...html.matchAll(/<div aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-full flex items-end justify-center ([^"]*)"/g)].map((match) => match[1]);
    expect(crews).toEqual(["lg:hidden", "hidden lg:flex [@media(max-height:600px)]:lg:hidden"]);
  });

  it("reads out textcrew.in's headline; the floating apps, the cursor and the crew are decoration", () => {
    expect(html).toMatch(/<h2[^>]*>Got a lot of work\?<br\/><span class="whitespace-nowrap">Just text your crew<span aria-hidden="true" class="brand-caret/);
    expect(html).toContain("Tex, your AI captain, splits the job");
    const tiles = /<div aria-hidden="true" class="pointer-events-none absolute inset-0 hidden lg:block[^"]*">((?:(?!<\/div>)[\s\S])*)<\/div>/.exec(html)?.[1] ?? "";
    expect(tiles.match(/rounded-\[28%\]/g)).toHaveLength(6);
  });

  it("leaves out the floating apps, the row under the line and the crew as the window gets shorter", () => {
    expect(html).toContain('class="pointer-events-none absolute inset-0 hidden lg:block [@media(max-height:620px)]:lg:hidden"');
    expect(html).toMatch(/<div aria-hidden="true" class="mt-2 flex items-center gap-6 \[@media\(max-height:700px\)\]:hidden">/);
  });

  it("has the hero as a band on a phone, with the lockup and the headline, hidden once the wide layout shows", () => {
    const band = /<div class="(relative px-5 pt-5[^"]*)">/.exec(html)?.[1].split(" ") ?? [];
    expect(band).toEqual(expect.arrayContaining(["lg:hidden"]));
    expect(html.match(/<h2/g)).toHaveLength(2);
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
