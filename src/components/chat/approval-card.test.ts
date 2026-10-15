import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Approval } from "@/lib/api/client";
import { ApprovalQuestion } from "./approval-card";

// Tex's question in the thread: what it wants to do, in its words, with the Approve / Deny card under it.

const QUESTION = 'I\'d like to send an email to x@acme.com with subject "Test". Approve or Deny below.';
const approval = (status: Approval["status"]): Approval => ({
  id: "apr_1",
  status,
  summary: 'Send an email to x@acme.com with subject "Test"',
  app: "gmail",
  action: "GMAIL_SEND_EMAIL",
  details: { arguments: { to: "x@acme.com", subject: "Test", body: "Hello" } },
  createdAt: "2026-10-15T15:46:00.000Z",
  expiresAt: "2026-10-16T15:46:00.000Z",
  decidedAt: status === "pending" ? null : "2026-10-15T15:56:51.000Z",
});

const draw = (text: string, status: Approval["status"]) => {
  const qc = new QueryClient();
  qc.setQueryData(["approval", "apr_1"], approval(status));
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(ApprovalQuestion, { text, approvalId: "apr_1" })),
  );
};
const decode = (html: string) => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("ApprovalQuestion", () => {
  it("says what Tex wants to do, above the card with Approve and Deny", () => {
    const html = decode(draw(QUESTION, "pending"));
    expect(html).toContain(QUESTION);
    expect(html.indexOf(QUESTION)).toBeLessThan(html.indexOf("Needs your OK"));
    expect(html).toMatch(/>Approve<\/button>/);
    expect(html).toMatch(/>Deny<\/button>/);
    expect(html).not.toContain("Reject");
  });

  it("keeps the question once it is answered, and says how it was answered", () => {
    expect(decode(draw(QUESTION, "approved"))).toContain(QUESTION);
    expect(decode(draw(QUESTION, "approved"))).toContain("You approved this");
    expect(decode(draw(QUESTION, "rejected"))).toContain("You denied this");
  });

  it("shows an older ask, which only repeated the summary, as the card alone", () => {
    const html = decode(draw('Approval needed: Send an email to x@acme.com with subject "Test"', "pending"));
    expect(html).not.toContain("Approval needed");
    expect(html).toContain("Needs your OK");
  });
});
