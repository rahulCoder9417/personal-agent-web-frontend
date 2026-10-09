import { describe, expect, it } from "vitest";
import { codeLanguage, hasMarkdown, safeLink } from "./markdown";

describe("hasMarkdown", () => {
  it("finds nothing to draw in a plain reply, so it is shown as typed", () => {
    for (const text of [
      "On it. Your 3pm is “Roadmap sync”. Moving it to tomorrow, same time.",
      "Good. Say the word and I’ll post it in #team; that one will need your OK.",
      "Patch reviewed pull request #128 in northwind/website. Two things to fix before you merge.",
      "Two lines:\nthe second one\n\nand a paragraph after a blank line.",
      "That costs $10 (about 5% more), is that OK? 2 - 1 = 1.",
      "    four spaces in, kept as typed",
      "Ask @maya, she knows. It was 2024. A good year.",
      "",
    ]) {
      expect(hasMarkdown(text), text).toBe(false);
    }
  });

  it("finds each kind of Markdown", () => {
    for (const text of [
      "This is **bold**.",
      "This is _italic_.",
      "Run `pnpm test`.",
      "```\ncode\n```",
      "~~gone~~",
      "## A heading",
      "Title\n=====",
      "Above\n\n---\n\nBelow",
      "Steps:\n- one\n- two",
      "  + indented item",
      "1. first\n2. second",
      "1) first",
      "> quoted",
      "| A | B |\n|---|---|\n| 1 | 2 |",
      "See [the page](https://example.com).",
      "![a chart](https://example.com/chart.png)",
      "Raw <b>HTML</b>",
      "A star \\* escaped",
    ]) {
      expect(hasMarkdown(text), text).toBe(true);
    }
  });

  it("counts a bare address or email, which the renderer makes into a link", () => {
    expect(hasMarkdown("It’s at https://example.com/page")).toBe(true);
    expect(hasMarkdown("See www.example.com")).toBe(true);
    expect(hasMarkdown("Write to maya@acme.com")).toBe(true);
  });

  it("counts a character written as an entity", () => {
    expect(hasMarkdown("Fish &amp; chips")).toBe(true);
    expect(hasMarkdown("Fish & chips; then tea")).toBe(false);
  });
});

describe("safeLink", () => {
  it("lets web pages and email addresses through as they are", () => {
    expect(safeLink("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(safeLink("http://example.com")).toBe("http://example.com");
    expect(safeLink("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
    expect(safeLink("mailto:maya@acme.com")).toBe("mailto:maya@acme.com");
    expect(safeLink("  https://example.com  ")).toBe("https://example.com");
  });

  it("refuses every other scheme", () => {
    for (const url of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/1",
      "tel:+15550100",
      "ftp://example.com",
      "irc://example.com",
    ]) {
      expect(safeLink(url), url).toBeNull();
    }
  });

  it("refuses an address that isn't given in full", () => {
    for (const url of ["/settings/plans", "//evil.example/x", "example.com", "#top", "?a=1", "https:evil.example", "https://", "", null, undefined]) {
      expect(safeLink(url), String(url)).toBeNull();
    }
  });
});

describe("codeLanguage", () => {
  it("reads the language a fenced block was given", () => {
    expect(codeLanguage(["language-ts"])).toBe("ts");
    expect(codeLanguage(["hljs", "language-c++"])).toBe("c++");
    expect(codeLanguage("language-bash")).toBe("bash");
  });

  it("is null without one, or for something that isn't a short word", () => {
    expect(codeLanguage(undefined)).toBeNull();
    expect(codeLanguage([])).toBeNull();
    expect(codeLanguage(["task-list-item"])).toBeNull();
    expect(codeLanguage([`language-${"x".repeat(40)}`])).toBeNull();
    expect(codeLanguage(['language-"><b>'])).toBeNull();
  });
});
