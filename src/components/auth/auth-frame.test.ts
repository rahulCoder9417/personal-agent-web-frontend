import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Brand } from "@/components/shell/brand";
import { AuthFrame } from "./auth-frame";

// The form goes in as createElement's third argument; the props' type wants it among the props.
const html = renderToStaticMarkup(createElement(AuthFrame, {} as ComponentProps<typeof AuthFrame>, createElement("form", { id: "the-form" })));
const tag = (name: string) => new RegExp(`<${name}[^>]*>`).exec(html)?.[0] ?? "";
const classes = (element: string) => (/class="([^"]*)"/.exec(element)?.[1] ?? "").replaceAll("&amp;", "&").split(" ");
const styles = [...html.matchAll(/style="([^"]*)"/g)].map((match) => match[1].replaceAll("&quot;", '"')).join(" ");

describe("AuthFrame", () => {
  it("draws the form once, centred at a comfortable width, in a page that scrolls rather than cutting anything off", () => {
    expect(html.match(/<form id="the-form">/g)).toHaveLength(1);
    const column = /<div class="([^"]*)"><form id="the-form">/.exec(html)?.[1].split(" ") ?? [];
    expect(column).toEqual(expect.arrayContaining(["mx-auto", "w-full", "max-w-[400px]"]));
    expect(classes(tag("div"))).toEqual(expect.arrayContaining(["h-dvh", "overflow-y-auto"]));
  });

  it("is on textcrew.in's page colour, from the design tokens", () => {
    expect(styles).toContain("background:color-mix(in srgb, var(--bg) 40%, var(--surface))");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
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

  it("says nothing about a beta", () => {
    expect(html).not.toMatch(/beta/i);
  });

  it("leaves out the floating apps, the row under the line and the crew as the window gets shorter", () => {
    expect(html).toContain('class="pointer-events-none absolute inset-0 hidden lg:block [@media(max-height:620px)]:lg:hidden"');
    expect(html).toMatch(/<div aria-hidden="true" class="mt-2 flex items-center gap-6 \[@media\(max-height:700px\)\]:hidden">/);
  });

  it("makes the crew smaller in a short window, and the room above the card with it", () => {
    const layout = classes(/<div class="(relative flex min-h-full[^"]*)"/.exec(html)?.[0] ?? "");
    expect(layout).toEqual(expect.arrayContaining(["[--crew:clamp(96px,17vh,168px)]", "[@media(max-height:760px)]:[--crew:13vh]", "lg:pt-[calc(var(--crew)*0.9+16px)]"]));
    expect(styles).toContain("height:calc(var(--crew) * 1)");
  });

  it("has the hero as a band on a phone, with the lockup and the headline, hidden once the wide layout shows", () => {
    const band = /<div class="(relative px-5 pt-5[^"]*)">/.exec(html)?.[1].split(" ") ?? [];
    expect(band).toEqual(expect.arrayContaining(["lg:hidden"]));
    expect(html.match(/<h2/g)).toHaveLength(2);
    expect(html.match(/aria-label="Textcrew, home"/g)).toHaveLength(2);
  });
});

describe("Brand", () => {
  it("draws the lockup in ink with the blue cursor by default", () => {
    const lockup = renderToStaticMarkup(createElement(Brand));
    expect(lockup).toContain("bg-accent");
    expect(lockup).not.toContain("bg-surface");
    expect(lockup).not.toContain("text-white");
  });

  it("puts Tex's face on a white tile and whitens the words on the brand blue", () => {
    const lockup = renderToStaticMarkup(createElement(Brand, { onColour: true }));
    expect(/<a[^>]*class="([^"]*)"/.exec(lockup)?.[1].split(" ")).toContain("text-white");
    expect(lockup).toMatch(/<span class="[^"]*bg-surface[^"]*"><svg/);
    expect(lockup).toMatch(/brand-caret[^"]*bg-surface/);
  });
});
