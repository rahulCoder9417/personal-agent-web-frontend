import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP_SECTIONS } from "@/lib/help-content";
import { appRoutes, pathOf } from "@/test/app-routes";
import HelpPage from "@/app/(app)/help/page";

// The Help page as it is first drawn (no search typed): every topic and answer is on it, and every
// link on it leads somewhere real.

const html = renderToStaticMarkup(createElement(HelpPage));
const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
const idsOnPage = new Set([...html.matchAll(/\bid="([^"]*)"/g)].map((match) => match[1]));

describe("the Help page", () => {
  it("is called Help, with a search field that says what it is", () => {
    expect(html).toMatch(/<h1[^>]*>Help<\/h1>/);
    expect(html).toMatch(/<label for="([^"]+)" class="sr-only">Search help<\/label><svg[^>]*>.*?<input id="\1" type="search"/);
  });

  it("starts with what Textcrew is, and the answers most asked for", () => {
    expect(html).toContain(">How Textcrew works</h2>");
    expect(html).toContain("Most asked:");
    expect(html).toContain('href="#telegram-commands"');
  });

  it("lists the topics at the top, each leading to its part of the page", () => {
    const contents = /<nav id="help-contents" aria-label="Help topics"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    for (const section of HELP_SECTIONS) {
      expect(contents).toContain(`href="#${section.id}"`);
      expect(contents).toContain(`>${section.title}</span>`);
    }
  });

  it("draws every topic with its heading, and every answer in it", () => {
    for (const section of HELP_SECTIONS) {
      expect(html).toContain(`<section id="${section.id}" aria-labelledby="${section.id}-title"`);
      expect(html).toContain(`id="${section.id}-title"`);
      for (const topic of section.topics) {
        expect(html).toContain(`<article id="${topic.id}" aria-labelledby="${topic.id}-title"`);
        // Each answer's address can be copied, to send to someone.
        expect(html).toContain(`aria-label="Copy a link to “${topic.title}”"`);
      }
    }
  });

  it("explains the Telegram commands in a table, /new first", () => {
    const commands = /<article id="telegram-commands"[\s\S]*?<\/article>/.exec(html)?.[0] ?? "";
    expect(commands).toContain("<table");
    expect(commands.indexOf("/new")).toBeLessThan(commands.indexOf("/start"));
  });

  it("leads only to pages the app has, to parts of this page, or to the privacy policy", () => {
    const routes = appRoutes();
    expect(hrefs.length).toBeGreaterThan(80);
    for (const href of hrefs) {
      if (href.startsWith("#")) expect(idsOnPage, href).toContain(href.slice(1));
      else if (/^https?:/.test(href)) expect(href).toBe("https://textcrew.in/privacy");
      else expect(routes, href).toContain(pathOf(href));
    }
  });

  it("offers to try each example in the chat, typed in and not sent", () => {
    expect(html).toContain('href="/?draft=Remember%20that%20Priya%20handles%20finance."');
    expect(html).toMatch(/aria-label="Try it in chat: Remember that Priya handles finance\."/);
  });

  it("opens the privacy policy in a new tab", () => {
    expect(html).toMatch(/<a href="https:\/\/textcrew\.in\/privacy" target="_blank" rel="noreferrer"/);
  });
});
