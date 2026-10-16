import { describe, expect, it } from "vitest";
import { appRoutes, pathOf } from "@/test/app-routes";
import { ask, countAnswers, groupAsks, isExternal, note, p, parseInline, PLACES, placeName, plainText, searchHelp, topicLinks, topicSentences, topicText, type HelpSection } from "./help";
import { HELP_ASK_TEX, HELP_POPULAR, HELP_SECTIONS } from "./help-content";

const topics = HELP_SECTIONS.flatMap((section) => section.topics.map((topic) => ({ section, topic })));
const ids = (sections: ReturnType<typeof searchHelp>) => sections.flatMap((section) => section.topics.map((topic) => topic.id));

describe("the markup in a sentence of help", () => {
  it("draws a place as a link with the place's own name", () => {
    expect(parseInline("Open {apps} and press **Connect**.")).toEqual([
      { type: "text", text: "Open " },
      { type: "link", text: "Integrations → Apps", href: "/integrations/apps" },
      { type: "text", text: " and press " },
      { type: "bold", text: "Connect" },
      { type: "text", text: "." },
    ]);
  });

  it("reads links, code and bold words, in any order", () => {
    expect(parseInline("Send `/new`. See [Your AI](#ai), or **Approve**.")).toEqual([
      { type: "text", text: "Send " },
      { type: "code", text: "/new" },
      { type: "text", text: ". See " },
      { type: "link", text: "Your AI", href: "#ai" },
      { type: "text", text: ", or " },
      { type: "bold", text: "Approve" },
      { type: "text", text: "." },
    ]);
  });

  it("leaves an unknown place as typed, so a slip shows", () => {
    expect(parseInline("Open {nowhere}.").every((piece) => piece.type === "text")).toBe(true);
    expect(plainText("Open {nowhere}.")).toBe("Open {nowhere}.");
  });

  it("reads as plain words without the markup", () => {
    expect(plainText("Open {ai}, send `/new` and press **Start**.")).toBe("Open Settings → Agent & AI, send /new and press Start.");
  });

  it("puts examples that follow each other in one box", () => {
    const drawn = groupAsks([p("a"), ask("one"), ask("two"), note("n"), ask("three")]);
    expect(drawn.map((block) => block.kind)).toEqual(["p", "asks", "note", "asks"]);
    expect(drawn[1]).toEqual({ kind: "asks", items: ["one", "two"] });
  });

  it("names a place on a button by its short name", () => {
    expect(placeName("ai")).toBe("Agent & AI");
    expect(placeName("apps")).toBe("Apps");
    expect(placeName("chatApps")).toBe("Chat apps");
  });
});

describe("the help, as written", () => {
  it("has the ten topics, in order", () => {
    expect(HELP_SECTIONS.map((section) => section.title)).toEqual([
      "Getting started",
      "The crew",
      "Telegram",
      "Your AI",
      "Apps and integrations",
      "Approvals",
      "Automations",
      "Credits and plans",
      "Memory and privacy",
      "Troubleshooting",
    ]);
    for (const section of HELP_SECTIONS) expect(section.topics.length).toBeGreaterThan(0);
  });

  it("gives every section and answer an address of its own, fit for a link", () => {
    const all = [...HELP_SECTIONS.map((section) => section.id), ...topics.map(({ topic }) => topic.id)];
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("names only places the app knows", () => {
    for (const { topic } of topics) for (const sentence of topicSentences(topic)) expect(plainText(sentence), topic.id).not.toMatch(/[{}]/);
  });

  it("leads only to pages the app really has, to parts of this page, or to the privacy policy", () => {
    const routes = appRoutes();
    const anchors = new Set([...HELP_SECTIONS.map((section) => section.id), ...topics.map(({ topic }) => topic.id)]);
    const links = topics.flatMap(({ topic }) => topicLinks(topic));
    expect(links.length).toBeGreaterThan(40);
    for (const href of links) {
      if (href.startsWith("#")) expect(anchors, href).toContain(href.slice(1));
      else if (isExternal(href)) expect(href).toBe("https://textcrew.in/privacy");
      else expect(routes, href).toContain(pathOf(href));
    }
    for (const place of Object.values(PLACES)) if (!isExternal(place.href)) expect(routes, place.href).toContain(pathOf(place.href));
  });

  it("links Telegram and the apps in Integrations, never in the welcome flow", () => {
    expect(PLACES.linkTelegram.href).toBe("/integrations?link=telegram");
    expect(PLACES.chatApps.href).toBe("/integrations");
    expect(PLACES.apps.href).toBe("/integrations/apps");
    for (const place of Object.values(PLACES)) expect(place.href).not.toMatch(/^\/onboarding|^\/apps/);
  });

  it("points the most asked questions at answers that exist", () => {
    const answers = new Set(topics.map(({ topic }) => topic.id));
    for (const item of HELP_POPULAR) expect(answers).toContain(item.topic);
    expect(HELP_ASK_TEX.length).toBeGreaterThan(0);
  });

  it("explains every Telegram command the bot knows", () => {
    const telegram = HELP_SECTIONS.find((section) => section.id === "telegram")!;
    const commands = topicText(telegram, telegram.topics.find((topic) => topic.id === "telegram-commands")!);
    for (const said of ["/new", "/clear", "/reset", "/start", "link 7kq2 m9xp", "agt 7kq2", "yes", "no", "/help"]) expect(commands).toContain(said);
  });

  it("says /help is a command of its own, and that /new and /help are in the bot's menu", () => {
    const telegram = HELP_SECTIONS.find((section) => section.id === "telegram")!;
    const commands = topicText(telegram, telegram.topics.find((topic) => topic.id === "telegram-commands")!);
    expect(commands).toContain("menu");
    expect(commands).toContain("a link to this page");
    expect(commands).not.toContain("`/help` included, is a normal message");
  });
});

describe("searching the help", () => {
  it("shows everything for an empty search", () => {
    expect(searchHelp(HELP_SECTIONS, "  ")).toEqual(HELP_SECTIONS);
  });

  it("finds a command as typed, with the slash, the commands themselves first", () => {
    const found = ids(searchHelp(HELP_SECTIONS, "/new"));
    expect(found[0]).toBe("telegram-commands");
    expect(found).toContain("start-conversations");
    expect(found).not.toContain("credits-plans");
  });

  it("puts first the answer whose question holds the words, and its section with it", () => {
    const found = searchHelp(HELP_SECTIONS, "composio");
    expect(found[0].id).toBe("apps");
    expect(found[0].topics[0].id).toBe("apps-composio");
    expect(searchHelp(HELP_SECTIONS, "unlink")[0].topics[0].id).toBe("telegram-unlink");
  });

  it("keeps the page's order between answers that match as well", () => {
    const section = (id: string, ...texts: string[]): HelpSection => ({
      id,
      title: id,
      summary: "",
      icon: "faq",
      go: [],
      topics: texts.map((text, index) => ({ id: `${id}-${index}`, title: `Answer ${index}`, blocks: [p(text)] })),
    });
    const page = [section("one", "a bank", "the bank"), section("two", "one bank"), section("three", "bank and bank")];
    expect(ids(searchHelp(page, "bank"))).toEqual(["three-0", "one-0", "one-1", "two-0"]);
  });

  it("wants every word, whatever the case and the accents", () => {
    expect(ids(searchHelp(HELP_SECTIONS, "Unlink TELEGRAM"))).toContain("telegram-unlink");
    expect(ids(searchHelp(HELP_SECTIONS, "unlink credits"))).toEqual([]);
    expect(ids(searchHelp(HELP_SECTIONS, "doesnt answer"))).toContain("faq-no-answer");
    expect(ids(searchHelp(HELP_SECTIONS, "blocked bot"))[0]).toBe("faq-blocked");
  });

  it("finds nothing for words the help doesn't have", () => {
    expect(searchHelp(HELP_SECTIONS, "xylophone")).toEqual([]);
  });

  it("counts the answers found", () => {
    expect(countAnswers(searchHelp(HELP_SECTIONS, "xylophone"))).toBe("0 answers");
    expect(countAnswers([{ ...HELP_SECTIONS[0], topics: [HELP_SECTIONS[0].topics[0]] }])).toBe("1 answer");
  });
});

describe("what Help says about deleting an account", () => {
  it("matches the privacy page: workspace backups go with it, database backups within 7 days", () => {
    const found = topics.find(({ topic }) => topic.id === "privacy-delete-account");
    const words = topicText(found!.section, found!.topic);
    expect(words).toContain("the backups of your workspace files");
    expect(words).toContain("database backups within 7 days");
    expect(words).not.toContain("30 days");
  });
});
