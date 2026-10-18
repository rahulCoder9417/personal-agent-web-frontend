import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DevicesBlock } from "./devices";

describe("the devices block on More", () => {
  const html = renderToStaticMarkup(createElement(DevicesBlock, { telegramLinked: false }));

  it("lists the four ways to use Textcrew", () => {
    for (const name of ["Web app", "Telegram", "Desktop app", "Mobile app"]) expect(html).toContain(name);
  });

  it("says the desktop and mobile apps are in beta", () => {
    expect(html.match(/In beta/g)).toHaveLength(2);
  });

  it("links to Telegram's linking panel only, never to a download", () => {
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/integrations?link=telegram"]);
    expect(html).not.toMatch(/download=|\.dmg|\.exe|apps\.apple|play\.google/i);
  });

  it("shows Telegram as linked when it is", () => {
    expect(renderToStaticMarkup(createElement(DevicesBlock, { telegramLinked: true }))).toContain("Linked");
  });
});
