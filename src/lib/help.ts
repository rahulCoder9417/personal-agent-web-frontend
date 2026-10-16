// The Help page's parts that aren't words: what a piece of help is made of, the places in the app
// it leads to, the small markup its sentences use, and the search. The words themselves are in
// help-content.ts.

import { chatDraftHref } from "./chat-link";
import { INTEGRATIONS_APPS_PATH, INTEGRATIONS_MCP_PATH, INTEGRATIONS_PATH, linkChatHref } from "./integrations";
import { PRICING_PATH } from "./pricing";

// ---------------------------------------------------------------- places

export type Place = {
  /** What the place is called in a sentence. */
  label: string;
  /** Its name on a button, when the label is a path ("Settings → Memory" is "Memory"). */
  short?: string;
  href: string;
};

/**
 * Every place in the app the help names, with what it is called and where it is. A sentence says
 * `{apps}` and gets a link that reads "Integrations → Apps". When a screen moves or is renamed,
 * only this table changes.
 */
export const PLACES = {
  chat: { label: "the chat", short: "Chat", href: "/" },
  automationsChat: { label: "the Automations chat", short: "Automations chat", href: "/?chat=automations" },
  approvals: { label: "Approvals", href: "/approvals" },
  automations: { label: "Automations", href: "/automations" },
  prReview: { label: "Automations → Pull-request review", short: "Pull-request review", href: "/automations/reviews" },
  activity: { label: "Activity", href: "/activity" },
  apps: { label: "Integrations → Apps", short: "Apps", href: INTEGRATIONS_APPS_PATH },
  mcp: { label: "Integrations → MCP servers", short: "MCP servers", href: INTEGRATIONS_MCP_PATH },
  chatApps: { label: "Integrations → Chat apps", short: "Chat apps", href: INTEGRATIONS_PATH },
  linkTelegram: { label: "Link Telegram", href: linkChatHref("telegram") },
  settings: { label: "Settings", href: "/settings" },
  timezone: { label: "Settings → General", short: "General settings", href: "/settings" },
  ai: { label: "Settings → Agent & AI", short: "Agent & AI", href: "/settings/agent" },
  memory: { label: "Settings → Memory", short: "Memory", href: "/settings/memory" },
  credits: { label: "Settings → Credits", short: "Credits", href: "/settings/credits" },
  plans: { label: "Pricing", href: PRICING_PATH },
  account: { label: "Settings → General → Account", short: "Account", href: "/settings" },
  privacy: { label: "textcrew.in/privacy", href: "https://textcrew.in/privacy" },
} as const satisfies Record<string, Place>;

export type PlaceId = keyof typeof PLACES;

/** A place's name on a button: its short name, or its label. */
export function placeName(id: PlaceId): string {
  const place: Place = PLACES[id];
  return place.short ?? place.label;
}

/** A link that leaves the app (the privacy policy) opens in a new tab. */
export const isExternal = (href: string) => /^https?:\/\//.test(href);

// ---------------------------------------------------------------- what help is made of

/**
 * One piece of an answer. Text may hold the markup `parseInline` reads: `{place}`, `[words](href)`,
 * `**bold**` and `` `code` ``.
 */
export type HelpBlock =
  | { kind: "p"; text: string }
  /** Numbered steps, in order. */
  | { kind: "steps"; items: readonly string[] }
  | { kind: "list"; items: readonly string[] }
  /** Two columns: a thing and what it means. */
  | { kind: "table"; head: readonly [string, string]; rows: readonly (readonly [string, string])[] }
  /** A message to send Tex, as typed. The page offers to open the chat with it. */
  | { kind: "ask"; text: string }
  /** A side remark: a limit, a catch, what isn't there yet. */
  | { kind: "note"; text: string };

export const p = (text: string): HelpBlock => ({ kind: "p", text });
export const steps = (...items: string[]): HelpBlock => ({ kind: "steps", items });
export const list = (...items: string[]): HelpBlock => ({ kind: "list", items });
export const table = (head: readonly [string, string], ...rows: (readonly [string, string])[]): HelpBlock => ({ kind: "table", head, rows });
export const ask = (text: string): HelpBlock => ({ kind: "ask", text });
export const note = (text: string): HelpBlock => ({ kind: "note", text });

/** One question and its answer. Its `id` is its address on the page (`/help#telegram-commands`). */
export type HelpTopic = { id: string; title: string; blocks: readonly HelpBlock[] };

export type HelpIconName = "start" | "crew" | "telegram" | "ai" | "apps" | "approvals" | "automations" | "credits" | "privacy" | "faq";

/** One part of the page: a heading, a line on what is in it, the screens it is about, and its answers. */
export type HelpSection = {
  id: string;
  title: string;
  summary: string;
  icon: HelpIconName;
  /** The screens where this is done, as buttons beside the heading. */
  go: readonly PlaceId[];
  topics: readonly HelpTopic[];
};

/** A block as it is drawn: examples that follow each other are one box of things to try. */
export type DrawnBlock = Exclude<HelpBlock, { kind: "ask" }> | { kind: "asks"; items: string[] };

export function groupAsks(blocks: readonly HelpBlock[]): DrawnBlock[] {
  const out: DrawnBlock[] = [];
  for (const block of blocks) {
    const previous = out.at(-1);
    if (block.kind !== "ask") out.push(block);
    else if (previous?.kind === "asks") previous.items.push(block.text);
    else out.push({ kind: "asks", items: [block.text] });
  }
  return out;
}

// ---------------------------------------------------------------- the markup in a sentence

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

// `{place}`, `[words](href)`, `**bold**` or `` `code` ``, whichever comes first.
const TOKEN = /\{([a-zA-Z]+)\}|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/**
 * A sentence of help in pieces: plain words, bold words, code (a command, a code to send) and
 * links. `{apps}` is the place's link with its own name. An unknown place stays as typed, so a
 * slip shows on the page (and fails the tests) instead of vanishing.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    const [whole, place, words, href, bold, code] = match;
    if (place !== undefined) {
      const known = (PLACES as Record<string, Place>)[place];
      out.push(known ? { type: "link", text: known.label, href: known.href } : { type: "text", text: whole });
    } else if (words !== undefined && href !== undefined) out.push({ type: "link", text: words, href });
    else if (bold !== undefined) out.push({ type: "bold", text: bold });
    else if (code !== undefined) out.push({ type: "code", text: code });
    last = at + whole.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** The words a sentence reads as, without its markup. */
export function plainText(text: string): string {
  return parseInline(text)
    .map((piece) => piece.text)
    .join("");
}

/** Every sentence of a block, as typed. */
function blockTexts(block: HelpBlock): string[] {
  switch (block.kind) {
    case "steps":
    case "list":
      return [...block.items];
    case "table":
      return [...block.head, ...block.rows.flat()];
    default:
      return [block.text];
  }
}

/** Every sentence of a topic, as typed (markup and all). */
export function topicSentences(topic: HelpTopic): string[] {
  return topic.blocks.flatMap(blockTexts);
}

/** Every link a topic holds, places and `[words](href)` alike, and the chat links of its examples. */
export function topicLinks(topic: HelpTopic): string[] {
  return [
    ...topicSentences(topic).flatMap((text) => parseInline(text).flatMap((piece) => (piece.type === "link" ? [piece.href] : []))),
    ...topic.blocks.flatMap((block) => (block.kind === "ask" ? [chatDraftHref(block.text)] : [])),
  ];
}

// ---------------------------------------------------------------- search

/** Lower case, accents off, punctuation as spaces: what a search compares. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();
}

/** Everything a topic says, its section's name included, as the search reads it. */
export function topicText(section: HelpSection, topic: HelpTopic): string {
  return fold([section.title, topic.title, ...topicSentences(topic).map(plainText)].join(" "));
}

/** How many times `word` is in `text`. */
function timesIn(text: string, word: string): number {
  return text.split(word).length - 1;
}

/**
 * The sections and topics that hold every word typed, best first: an answer whose question holds
 * every word, then the answer that says the words most often. A section comes as high as its best
 * answer; a tie keeps the page's order. An empty search is everything, in the page's order.
 */
export function searchHelp(sections: readonly HelpSection[], query: string): HelpSection[] {
  const words = fold(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...sections];
  const found = sections.flatMap((section, order) => {
    const scored = section.topics.flatMap((topic) => {
      const text = topicText(section, topic);
      if (!words.every((word) => text.includes(word))) return [];
      const title = fold(topic.title);
      const score = (words.every((word) => title.includes(word)) ? 1000 : 0) + words.reduce((sum, word) => sum + timesIn(text, word), 0);
      return [{ topic, score }];
    });
    if (scored.length === 0) return [];
    // Array.prototype.sort is stable, so answers that score the same keep the page's order.
    scored.sort((a, b) => b.score - a.score);
    return [{ section: { ...section, topics: scored.map((hit) => hit.topic) }, best: scored[0].score, order }];
  });
  found.sort((a, b) => b.best - a.best || a.order - b.order);
  return found.map((hit) => hit.section);
}

/** "3 answers" or "1 answer". */
export function countAnswers(sections: readonly HelpSection[]): string {
  const count = sections.reduce((sum, section) => sum + section.topics.length, 0);
  return `${count} ${count === 1 ? "answer" : "answers"}`;
}
