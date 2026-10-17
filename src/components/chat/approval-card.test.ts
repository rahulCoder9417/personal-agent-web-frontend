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
  kind: "app_action",
  status,
  summary: 'Send an email to x@acme.com with subject "Test"',
  app: "gmail",
  action: "GMAIL_SEND_EMAIL",
  details: { arguments: { to: "x@acme.com", subject: "Test", body: "Hello" } },
  createdAt: "2026-10-15T15:46:00.000Z",
  expiresAt: "2026-10-16T15:46:00.000Z",
  decidedAt: status === "pending" ? null : "2026-10-15T15:56:51.000Z",
});

const draw = (text: string, status: Approval["status"], over: Partial<Approval> = {}) => {
  const qc = new QueryClient();
  qc.setQueryData(["approval", "apr_1"], { ...approval(status), ...over });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(ApprovalQuestion, { text, approvalId: "apr_1" })),
  );
};
const decode = (html: string) => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("ApprovalQuestion", () => {
  it("says one short line above the card, not a copy of the long summary", () => {
    const html = decode(draw(QUESTION, "pending"));
    expect(html).not.toContain(QUESTION);
    expect(html).toContain("I need your OK for this.");
    expect(html.indexOf("I need your OK for this.")).toBeLessThan(html.indexOf("Needs your OK</span>"));
    expect(html).toMatch(/>Approve<\/button>/);
    expect(html).toMatch(/>Deny<\/button>/);
    expect(html).not.toContain("Reject");
  });

  it("turns into one tinted line once it is answered, and says how it was answered", () => {
    const one = decode(draw(QUESTION, "approved"));
    expect(one).toContain("bg-success-soft");
    expect(one).not.toMatch(/>Approve<\/button>/);
    expect(one).not.toContain("<details");
    expect(decode(draw(QUESTION, "rejected"))).toContain("bg-danger-soft");
    expect(one).toContain("I need your OK for this.");
    expect(decode(draw(QUESTION, "approved"))).toContain("You approved this");
    expect(decode(draw(QUESTION, "rejected"))).toContain("You denied this");
  });

  it("shows Approve and Deny as two buttons, the time left on its own line, and the fields collapsed", () => {
    const html = decode(draw(QUESTION, "pending"));
    expect(html).toContain("grid-cols-2");
    expect(html).toMatch(/>Approve<\/button>/);
    expect(html).toMatch(/>Deny<\/button>/);
    expect(html).toContain("Show the details");
    expect(html).toMatch(/<details(?![^>]*\bopen)/);
  });

  it("shows an older ask, which only repeated the summary, as the card alone", () => {
    const html = decode(draw('Approval needed: Send an email to x@acme.com with subject "Test"', "pending"));
    expect(html).not.toContain("Approval needed");
    expect(html).toContain("Needs your OK");
  });
});

describe("the agent's own actions on the card", () => {
  const CURL = "curl -s https://example.com/data.json -H 'Accept: application/json'";

  it("shows the exact command, why it needs an OK and the folder, with Approve and Deny", () => {
    const html = decode(
      draw(`I'd like to run this command: ${CURL}. Approve or Deny below.`, "pending", {
        kind: "command",
        app: null,
        action: "TEXTCREW_RUN_COMMAND",
        summary: `Run this command: \`${CURL}\``,
        details: { tool: "Bash", target: CURL, why: "it reaches the internet", folder: "/data/workspace", arguments: { tool: "Bash", target: CURL } },
      }),
    );
    expect(html).not.toContain(CURL.slice(0, 5) + " https://example.com/data.json -H 'Accept: application/json'. Approve");
    // The command sits behind a closed "Show the exact command" toggle; opening it reveals it.
    expect(html).toMatch(/<details(?![^>]*\bopen)/);
    expect(html).toContain("Show the exact command");
    expect(html.indexOf("Show the exact command")).toBeLessThan(html.indexOf(`aria-label="Command"`));
    expect(html).toContain('aria-label="Command"');
    expect(html).toContain(`>${CURL}</pre>`);
    expect(html).toContain("It needs your OK because it reaches the internet.");
    expect(html).toContain("/data/workspace");
    expect(html).toContain("I need your OK for this.");
    expect(html).toMatch(/>Approve<\/button>/);
    // Not shown as the raw fields of an app's action.
    expect(html).not.toContain("Target");
  });

  it("shows the repository and branch of a push, and warns about a force push", () => {
    const push = (force: boolean) =>
      decode(
        draw("I'd like to push. Approve or Deny below.", "pending", {
          kind: "git_push",
          app: null,
          action: "TEXTCREW_GIT_PUSH",
          summary: "Push",
          details: { repo: "acme/web", branch: "develop", force },
        }),
      );
    expect(push(false)).toContain("acme/web");
    expect(push(false)).toContain("develop");
    expect(push(false)).toContain("Pushes code.");
        expect(push(true)).toContain("A force push rewrites the branch’s history.");
    expect(push(true)).toContain("A force push rewrites the branch’s history");
  });

  it("lists what a crew job's run again will be allowed", () => {
    const html = decode(
      draw("I'd like to run Byte's job again. Approve or Deny below.", "pending", {
        kind: "crew_rerun",
        app: null,
        action: "TEXTCREW_RERUN_CREW_JOB",
        summary: "Run Byte's job again",
        details: { job: "Fix the login in acme/web", items: ["Run `curl https://x.example`", 'Push to the branch "develop" of acme/web, which already existed'] },
      }),
    );
    expect(html).toContain("Fix the login in acme/web");
    expect(html).toContain("<li");
    expect(html).toContain('Push to the branch "develop" of acme/web, which already existed');
    expect(html).toContain("Runs the job again.");
  });
});
