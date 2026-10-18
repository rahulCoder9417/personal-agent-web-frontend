import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CrewMember } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { CREW_EXAMPLES } from "@/lib/crew";
import { handleDemoRequest } from "@/lib/demo";
import { CREW_SECTION_ID, HELP_SECTIONS } from "@/lib/help-content";
import { appRoutes, pathOf } from "@/test/app-routes";
import HelpPage from "@/app/(app)/help/page";

// The Help page as it is first drawn (no search typed): every topic and answer is on it, and every
// link on it leads somewhere real. The crew's part starts with who is on the crew, as the backend
// (here the demo's) lists it.

const crewList = (await (await handleDemoRequest(new Request("http://localhost/api/v1/crew"), ["crew"])).json()) as { items: CrewMember[] };

/** The page, with the crew list the backend gave (or none yet). */
function drawHelp(crew: { items: CrewMember[] } | null = crewList): string {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  if (crew) client.setQueryData(qk.crew, crew);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HelpPage)));
}

const html = drawHelp();
const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
const idsOnPage = new Set([...html.matchAll(/\bid="([^"]*)"/g)].map((match) => match[1]));

describe("the Help page", () => {
  it("is called Help, with a search field that says what it is", () => {
    expect(html).toMatch(/<h1[^>]*>Help<\/h1>/);
    expect(html).toMatch(/<label for="([^"]+)" class="sr-only">Search help<\/label><svg[^>]*>.*?<input id="\1" type="search"/);
    expect(html).toContain("Short answers on how Textcrew works.");
  });

  it("starts with what Textcrew is, and the answers most asked for", () => {
    expect(html).toContain("Most asked:");
    expect(html).toContain('href="#apps-gmail"');
    expect(html).toContain('href="#approvals-why"');
  });

  it("offers three steps to get started, each opening its screen, and a way to write to us", () => {
    expect(html).toContain(">Get started in 3 steps</h2>");
    const start = /<section aria-labelledby="help-start"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(start.match(/<li /g)).toHaveLength(3);
    for (const href of ['href="/settings/agent"', 'href="/integrations/apps"', 'href="/"', 'href="#apps-gmail"']) expect(start).toContain(href);
    expect(html).toMatch(/href="mailto:support@textcrew\.in\?subject=Textcrew%20help&amp;body=/);
  });

  it("lists the topics as cards with their number of questions, each leading to its part of the page", () => {
    const contents = /<nav id="help-contents" aria-label="Help topics"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    for (const section of HELP_SECTIONS) {
      expect(contents).toContain(`href="#${section.id}"`);
      expect(contents).toContain(`${section.title} <span`);
      expect(contents).toContain(`· ${section.topics.length}</span>`);
    }
  });

  it("has a row of section chips for phones and a rail for desktop, both leading to every section", () => {
    const chips = /<nav aria-label="Help sections"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    const rail = /<nav aria-label="Sections"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(chips).toContain("lg:hidden");
    expect(rail).toContain("lg:block");
    for (const section of HELP_SECTIONS) {
      expect(chips).toContain(`href="#${section.id}"`);
      expect(rail).toContain(`href="#${section.id}"`);
    }
  });

  it("draws every question closed, as a button that says so, with its answer in a panel it controls", () => {
    for (const section of HELP_SECTIONS)
      for (const topic of section.topics) {
        expect(html).toMatch(new RegExp(`<button type="button" aria-expanded="false" aria-controls="${topic.id}-panel"`));
        expect(html).toContain(`id="${topic.id}-panel"`);
      }
    expect(html).not.toContain('aria-expanded="true"');
  });

  it("has a compact support card near the top and a full one at the end", () => {
    expect(html.match(/aria-label="Contact support"/g)).toHaveLength(2);
    expect(html.indexOf('aria-label="Contact support"')).toBeLessThan(html.indexOf('id="help-contents"'));
    expect(html.match(/We usually reply within a day\./g)).toHaveLength(2);
    expect(html.match(/>Copy address</g)).toHaveLength(2);
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
    expect(hrefs.length).toBeGreaterThan(50);
    for (const href of hrefs) {
      if (href.startsWith("#")) expect(idsOnPage, href).toContain(href.slice(1));
      else if (href.startsWith("mailto:")) expect(href).toMatch(/^mailto:support@textcrew\.in\?subject=Textcrew%20help&body=/);
      else if (/^https?:/.test(href)) expect(href).toBe("https://textcrew.in/privacy");
      else expect(routes, href).toContain(pathOf(href));
    }
  });

  it("offers to try each example in the chat, typed in and not sent", () => {
    expect(html).toContain('href="/?draft=Remember%20that%20Priya%20handles%20finance."');
    expect(html).toMatch(/aria-label="Try it in chat: Remember that Priya handles finance\."/);
  });

  it("explains the crew in a part of its own, the one /crew leads to, right after Getting started", () => {
    expect(HELP_SECTIONS.map((section) => section.id).slice(0, 2)).toEqual(["start", CREW_SECTION_ID]);
    const crew = /<section id="crew" [\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(crew).toContain(">The crew</h2>");
    for (const name of ["Tex", "Byte", "Patch", "Scout"]) expect(crew).toContain(`>${name}</strong>`);
    // Byte and Patch are asked for in the chat, in plain words; there is no form or screen for them.
    for (const example of [CREW_EXAMPLES.byte, CREW_EXAMPLES.patch, CREW_EXAMPLES.scout])
      expect(crew).toContain(`href="/?draft=${encodeURIComponent(example)}"`);
    expect(crew).toContain("Fix the typo in the README on my repo");
    expect(crew).toContain("There is no form: you ask in plain words.");
    // Reviewing every pull request in a repo is the one thing set up on a screen: its template's canvas.
    expect(crew).toContain('href="/automations/new?template=pr-review"');
    expect(html).not.toMatch(/Give (Patch a review|Byte a job|the crew a job)|Crew page|crew jobs?/i);
  });

  it("starts the crew's part with who is on the crew here, each leading to how to ask for it", () => {
    const lineup = /<ul aria-label="Your crew"[\s\S]*?<\/ul>/.exec(html)?.[0] ?? "";
    for (const [name, topic] of [["Tex", "crew-who"], ["Byte", "crew-byte"], ["Patch", "crew-patch"], ["Scout", "crew-scout"]]) {
      expect(lineup).toMatch(new RegExp(`<a href="#${topic}"[^>]*>[\\s\\S]*?>${name}</span>`));
      expect(idsOnPage).toContain(topic);
    }
    expect(lineup).not.toContain("Coming soon");
  });

  it("marks a specialist that isn't switched on here as coming soon", () => {
    const page = drawHelp({ items: crewList.items.map((member) => (member.id === "scout" ? { ...member, available: false } : member)) });
    const lineup = /<ul aria-label="Your crew"[\s\S]*?<\/ul>/.exec(page)?.[0] ?? "";
    expect(lineup.match(/Coming soon/g)).toHaveLength(1);
    expect(page).toContain("Scout isn’t switched on here yet.");
  });

  it("still explains the crew before the backend has said who is on it", () => {
    const page = drawHelp(null);
    expect(page).not.toContain('aria-label="Your crew"');
    expect(page).toContain('<article id="crew-byte"');
  });

  it("opens the privacy policy in a new tab", () => {
    expect(html).toMatch(/<a href="https:\/\/textcrew\.in\/privacy" target="_blank" rel="noreferrer"/);
  });
});
