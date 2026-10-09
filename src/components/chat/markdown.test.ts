import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentBubble } from "./agent-bubble";
import Markdown from "./markdown";

/** The HTML a reply is drawn as. */
const draw = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));
/** The same, without the wrapper around every reply. */
const inner = (text: string) => draw(text).replace(/^<div class="markdown">/, "").replace(/<\/div>$/, "");

const NEW_TAB = 'target="_blank" rel="noopener noreferrer"';

describe("Markdown: what is drawn", () => {
  it("leaves plain words as they are", () => {
    expect(draw("Filed. Tidy notes are on your “Acme kickoff” page in Notion.")).toBe(
      '<div class="markdown"><p>Filed. Tidy notes are on your “Acme kickoff” page in Notion.</p></div>',
    );
    // Nothing here is Markdown, though it has its characters.
    expect(inner("2 * 3 * 4 = 24, and snake_case_name stays, and #team too")).toBe("<p>2 * 3 * 4 = 24, and snake_case_name stays, and #team too</p>");
  });

  it("keeps a single line break as a line break, and a blank line as a new paragraph", () => {
    expect(inner("Monday: gym\nTuesday: dentist")).toBe("<p>Monday: gym<br/>\nTuesday: dentist</p>");
    expect(inner("First.\n\nSecond.")).toBe("<p>First.</p>\n<p>Second.</p>");
  });

  it("draws bold, italic and strikethrough", () => {
    expect(inner("**bold** and *italic* and ~~gone~~")).toBe("<p><strong>bold</strong> and <em>italic</em> and <del>gone</del></p>");
  });

  it("draws headings", () => {
    expect(inner("# One\n\n## Two\n\n### Three")).toBe("<h1>One</h1>\n<h2>Two</h2>\n<h3>Three</h3>");
  });

  it("draws a list, a numbered list and a list inside a list", () => {
    expect(inner("- one\n- two")).toBe("<ul>\n<li>one</li>\n<li>two</li>\n</ul>");
    expect(inner("1. first\n2. second")).toBe("<ol>\n<li>first</li>\n<li>second</li>\n</ol>");
    expect(inner("3. third\n4. fourth")).toContain('<ol start="3">');
    expect(inner("- fruit\n  - apple\n  - pear\n- bread")).toBe("<ul>\n<li>fruit\n<ul>\n<li>apple</li>\n<li>pear</li>\n</ul>\n</li>\n<li>bread</li>\n</ul>");
  });

  it("draws a task list with a box per item, which says whether it is done", () => {
    const html = inner("- [ ] send the invoice\n- [x] book the room");
    expect(html).toContain('<ul class="contains-task-list">');
    expect(html).toMatch(/<li class="task-list-item"><span role="img" aria-label="To do"[^>]*><\/span> send the invoice<\/li>/);
    expect(html).toMatch(/<li class="task-list-item"><span role="img" aria-label="Done"[^>]*><svg[^]*<\/svg><\/span> book the room<\/li>/);
    // Nothing to tick: the box shows what Tex wrote.
    expect(html).not.toContain("<input");
  });

  it("draws a quote and a rule", () => {
    expect(inner("> quoted words")).toBe("<blockquote>\n<p>quoted words</p>\n</blockquote>");
    expect(inner("Above\n\n---\n\nBelow")).toBe("<p>Above</p>\n<hr/>\n<p>Below</p>");
  });

  it("draws a table with a header row, inside something that scrolls sideways", () => {
    const html = inner("| Plan | Price |\n|---|--:|\n| Pro | $20 |\n| Max | $60 |");
    expect(html).toMatch(/^<div class="[^"]*\boverflow-x-auto\b[^"]*"><table>/);
    expect(html).toContain("<thead><tr><th>Plan</th>");
    expect(html).toContain('<th style="text-align:right">Price</th>');
    expect(html).toContain('<tbody><tr><td>Pro</td><td style="text-align:right">$20</td></tr><tr><td>Max</td>');
  });

  it("tells a table of three or more columns how many it has, for its width on a phone", () => {
    expect(inner("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |")).toContain('<table style="--columns:3">');
    expect(inner("| A | B | C | D | E |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |")).toContain('<table style="--columns:5">');
  });

  it("draws code inside a sentence", () => {
    expect(inner("Run `pnpm test` first")).toBe("<p>Run <code>pnpm test</code> first</p>");
  });

  it("draws a fenced block of code with its language and a Copy button, and scrolls it sideways", () => {
    const html = inner("```ts\nconst a: number = 1;\nconst b = `<b>${a}</b>`;\n```");
    expect(html).toMatch(/<span class="[^"]*">ts<\/span>/);
    expect(html).toMatch(/<button type="button"[^>]*>(<svg[^]*<\/svg>)?Copy<\/button>/);
    expect(html).toMatch(/<pre class="[^"]*\boverflow-x-auto\b[^"]*"><code>const a: number = 1;\nconst b = `&lt;b&gt;\$\{a\}&lt;\/b&gt;`;<\/code><\/pre>/);
  });

  it("draws a block of code without a language, with no label", () => {
    const html = inner("```\nplain **stars** stay\n```");
    expect(html).toMatch(/<span class="[^"]*"><\/span>/);
    expect(html).toContain("<code>plain **stars** stay</code>");
    expect(html).toContain("Copy");
  });
});

describe("Markdown: links", () => {
  it("opens a web page in a new tab that can't reach back into this one", () => {
    expect(inner("See [the page](https://example.com/a?b=1).")).toBe(`<p>See <a href="https://example.com/a?b=1" ${NEW_TAB}>the page</a>.</p>`);
    expect(inner("[plain http](http://example.com)")).toBe(`<p><a href="http://example.com" ${NEW_TAB}>plain http</a></p>`);
  });

  it("makes a bare address and an email address into the same kind of link", () => {
    expect(inner("It is at https://example.com/x now")).toBe(`<p>It is at <a href="https://example.com/x" ${NEW_TAB}>https://example.com/x</a> now</p>`);
    expect(inner("Write to maya@acme.com")).toBe(`<p>Write to <a href="mailto:maya@acme.com" ${NEW_TAB}>maya@acme.com</a></p>`);
    expect(inner("[Email Maya](mailto:maya@acme.com)")).toBe(`<p><a href="mailto:maya@acme.com" ${NEW_TAB}>Email Maya</a></p>`);
  });

  it("does not make a javascript: link, or any other scheme, into a link", () => {
    for (const address of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,hi", "vbscript:x", "file:///etc/passwd", "tel:+15550100"]) {
      const html = inner(`[click me](${address})`);
      expect(html, address).toBe("<p><span>click me</span></p>");
    }
    expect(inner("<javascript:alert(1)>")).not.toContain("<a");
  });

  it("does not make an address inside this app, or one without its scheme, into a link", () => {
    expect(inner("[plans](/settings/plans)")).toBe("<p><span>plans</span></p>");
    expect(inner("[elsewhere](//evil.example/x)")).toBe("<p><span>elsewhere</span></p>");
    expect(inner("[top](#top)")).toBe("<p><span>top</span></p>");
  });

  it("holds for a link given by reference too", () => {
    expect(inner("[bad][1] and [good][2]\n\n[1]: javascript:alert(1)\n[2]: https://example.com")).toBe(
      `<p><span>bad</span> and <a href="https://example.com" ${NEW_TAB}>good</a></p>`,
    );
  });
});

describe("Markdown: what is never drawn", () => {
  it("shows raw HTML as the text it was typed as", () => {
    const html = draw("Hi <script>alert(1)</script> and <img src=x onerror=alert(1)> and <b>bold</b> and <a href=\"https://example.com\" onclick=\"x()\">a link</a>");
    expect(html).not.toMatch(/<(script|img|b|a)\b/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("&lt;a href=&quot;https://example.com&quot; onclick=&quot;x()&quot;&gt;a link&lt;/a&gt;");
  });

  it("shows HTML on lines of its own as a paragraph of text", () => {
    expect(inner('<div onclick="x()">\n<iframe src="https://example.com"></iframe>\n</div>\n\nAfter.')).toBe(
      "<p>&lt;div onclick=&quot;x()&quot;&gt;<br/>\n&lt;iframe src=&quot;https://example.com&quot;&gt;&lt;/iframe&gt;<br/>\n&lt;/div&gt;</p>\n<p>After.</p>",
    );
    expect(draw("<style>body{display:none}</style>")).not.toContain("<style");
    expect(draw("<!-- a comment -->\n\nwords")).not.toContain("<!--");
  });

  it("shows a picture as a link and does not fetch it", () => {
    const html = inner("![a chart](https://example.com/chart.png)");
    expect(html).toBe(`<p><a href="https://example.com/chart.png" ${NEW_TAB}>Image: a chart</a></p>`);
    // No <img>, and none of the hints React adds to fetch one early.
    expect(html).not.toMatch(/<img|<link|preload|srcset/i);
    expect(inner("![](https://example.com/pixel.gif)")).toBe(`<p><a href="https://example.com/pixel.gif" ${NEW_TAB}>Image</a></p>`);
  });

  it("shows a picture that is the text of a link as its words, inside that one link", () => {
    expect(inner("[![the badge](https://example.com/badge.svg)](https://example.com/project)")).toBe(
      `<p><a href="https://example.com/project" ${NEW_TAB}><span>Image: the badge</span></a></p>`,
    );
  });

  it("shows a picture with an address that isn't a web page as its words alone", () => {
    expect(inner("![inline](data:image/png;base64,AAAA)")).toBe("<p><span>Image: inline</span></p>");
    expect(inner("![local](/secret.png)")).toBe("<p><span>Image: local</span></p>");
    expect(inner("![a chart][c]\n\n[c]: https://example.com/c.png")).not.toMatch(/<img|preload/);
  });

  it("lists footnotes at the end, with no link to jump with", () => {
    const html = inner("A claim.[^1]\n\n[^1]: Where it comes from.");
    expect(html).toContain("<p>A claim.<sup><span>1</span></sup></p>");
    expect(html).toContain('<h6 id="footnote-label">Footnotes</h6>');
    expect(html).toContain("<p>Where it comes from. </p>");
    expect(html).not.toContain("<a");
  });
});

describe("AgentBubble", () => {
  const bubble = (text: string) => renderToStaticMarkup(createElement(AgentBubble, { text }));

  it("shows a plain reply exactly as typed, with its line breaks and spaces, and loads nothing for it", () => {
    const text = "On it.\n\n  Your 3pm is “Roadmap sync”.\nMoving it to tomorrow, same time.";
    const html = bubble(text);
    expect(html).toMatch(/^<div class="[^"]*\bwhitespace-pre-wrap\b[^"]*">/);
    expect(html.replace(/^<div class="[^"]*">/, "")).toBe(`${text}</div>`);
    expect(html).not.toContain("markdown");
  });

  it("shows a reply with Markdown as typed until the renderer has arrived, then draws it", async () => {
    const text = "This is **bold**.";
    expect(bubble(text)).toContain('<div class="whitespace-pre-wrap">This is **bold**.</div>');
    await vi.dynamicImportSettled();
    const html = bubble(text);
    expect(html).toContain('<div class="markdown"><p>This is <strong>bold</strong>.</p></div>');
    // Drawn as Markdown, the bubble itself no longer keeps every space and line break.
    expect(html).not.toContain("whitespace-pre-wrap");
  });
});
