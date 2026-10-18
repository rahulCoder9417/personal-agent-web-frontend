import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Approval } from "@/lib/api/client";
import { ApprovalDetail } from "./approval-detail";
import { ApprovalList } from "./approval-list";

const URL = "https://temp.4d4f16c61d.r2.cloudflarestorage.com/1656612/github/GITHUB_GET_RAW_REPOSITORY_CONTENT/response/16ea161f9f566b422190352e903fc673?X-Amz-Algorithm=AWS4-HMAC-SHA256";
const make = (over: Partial<Approval> = {}): Approval => ({
  id: "apr_1",
  kind: "command",
  status: "pending",
  summary: `Run this command: \`curl -s "${URL}"\``,
  app: null,
  action: null,
  details: { tool: "Bash", target: `curl -s "${URL}" 2>&1`, why: "it reaches the internet", folder: "/data/workspace" },
  createdAt: "2026-10-17T10:00:00.000Z",
  expiresAt: "2026-10-18T10:00:00.000Z",
  decidedAt: null,
  ...over,
});
const qc = () => new QueryClient();
const detail = (a: Approval) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: qc() }, createElement(ApprovalDetail, { approval: a, onDecided: () => {} })));
const list = (selectedId: string | null) =>
  renderToStaticMarkup(createElement(ApprovalList, { approvals: [make(), make({ id: "apr_2" })], selectedId, onSelect: () => {} }));

describe("ApprovalDetail", () => {
  it("wraps a long title, in a modest size, never a giant heading", () => {
    const html = detail(make());
    const h2 = html.match(/<h2 class="([^"]*)"/)![1];
    expect(h2).toContain("[overflow-wrap:anywhere]");
    expect(h2).toContain("line-clamp-2");
    expect(h2).toContain("text-[15px]");
    expect(h2).not.toMatch(/text-\[(1[8-9]|2\d)px\]/);
  });

  it("shows what will run, from the server's facts, above the details", () => {
    const html = detail(
      make({
        kind: "app_action",
        app: "github",
        action: "GITHUB_ADD_A_REPOSITORY_COLLABORATOR",
        summary: "Add Bob to the docs repo",
        details: { arguments: { owner: "acme", repo: "secret-plans", username: "eve" } },
        facts: [
          { label: "Action", value: "GitHub – add a repository collaborator" },
          { label: "Repository", value: "acme/secret-plans" },
          { label: "People", value: "eve" },
        ],
      }),
    );
    expect(html).toContain("What will run");
    expect(html).toContain("acme/secret-plans");
    expect(html.indexOf("What will run")).toBeLessThan(html.indexOf("<details"));
  });

  it("starts with the exact details open, on this page", () => {
    expect(detail(make())).toMatch(/<details open=""/);
    expect(detail(make())).toContain("Show the exact command");
  });

  it("has two equal buttons and one quiet Asked / Expires line", () => {
    const html = detail(make());
    expect(html).toContain("grid-cols-2");
    expect(html).toMatch(/>Approve<\/button>/);
    expect(html).toMatch(/>Deny<\/button>/);
    expect(html).toContain("Asked ");
    expect(html).toContain("Expires ");
  });

  it("uses the same neutral edge as the list", () => {
    expect(detail(make())).toContain("border-fg/10");
  });

  it("shows one tinted line, and no buttons, after a decision", () => {
    const html = detail(make({ status: "approved", decidedAt: "2026-10-17T10:05:00.000Z" }));
    expect(html).toContain("bg-success-soft");
    expect(html).not.toMatch(/>Deny<\/button>/);
  });
});

describe("ApprovalList", () => {
  it("fills the selected card softly, with no dark border, and keeps one neutral edge on all", () => {
    const html = list("apr_1");
    const cards = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain("bg-accent-soft");
    expect(cards[0]).toContain("border-accent/25");
    expect(cards[0]).not.toContain("border-fg-2");
    expect(cards[1]).toContain("hover:bg-surface-2");
    expect(cards[1]).not.toContain("bg-accent-soft");
    for (const c of cards) expect(c).toContain("border-fg/10");
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows a one-line title and the kind and time as quiet meta", () => {
    const html = list(null);
    expect(html).toContain("truncate");
    expect(html).toContain("Runs a command");
    expect(html).toContain("left");
  });
});
