import { describe, expect, it } from "vitest";
import {
  APPROVAL_RESULT,
  approvalOutcome,
  approvalQuestion,
  approvalReason,
  webApprovalLine,
  approvalReasonOf,
  ownAction,
  recipientList,
  ruleSavedToast,
  ruleScopeLine,
  runLine,
  skipChoices,
  splitDetails,
} from "./approvals";

describe("approvalReason", () => {
  it("spots actions that reach other people", () => {
    expect(approvalReason("GMAIL_SEND_EMAIL")).toEqual({ label: "Sends to someone else", tone: "info" });
    expect(approvalReason("SLACK_POST_MESSAGE").label).toBe("Sends to someone else");
    expect(approvalReason("calendarInviteGuests").label).toBe("Sends to someone else");
  });

  it("spots deleting and spending", () => {
    expect(approvalReason("GMAIL_DELETE_DRAFT")).toEqual({ label: "Deletes things", tone: "danger" });
    expect(approvalReason("DRIVE_TRASH_FILE").label).toBe("Deletes things");
    expect(approvalReason("NOTION_RENEW_PLAN")).toEqual({ label: "Costs money", tone: "danger" });
    expect(approvalReason("STRIPE_SEND_PAYMENT").label).toBe("Costs money");
  });

  it("matches whole words only", () => {
    expect(approvalReason("CALENDAR_POSTPONE_EVENT").label).toBe("Needs your OK");
    expect(approvalReason("API_PAYLOAD_UPDATE").label).toBe("Needs your OK");
  });

  it("falls back when there is nothing to go on", () => {
    expect(approvalReason(null)).toEqual({ label: "Needs your OK", tone: "neutral" });
    expect(approvalReason("")).toEqual({ label: "Needs your OK", tone: "neutral" });
  });
});

describe("splitDetails", () => {
  it("pulls the body out as the preview and keeps the short fields", () => {
    const { preview, fields } = splitDetails({
      to: "maya@acme.com",
      subject: "Moving today's 3pm",
      body: "Hi Maya, could we move today's 3pm?",
      threadId: "t_1",
    });
    expect(preview).toBe("Hi Maya, could we move today's 3pm?");
    expect(fields.map((f) => [f.label, f.value])).toEqual([
      ["To", "maya@acme.com"],
      ["Subject", "Moving today's 3pm"],
      ["Thread id", "t_1"],
    ]);
  });

  it("joins simple lists and skips nested objects and blanks", () => {
    const { preview, fields } = splitDetails({ cc: ["a@x.com", "b@x.com"], count: 12, meta: { a: 1 }, note: " " });
    expect(preview).toBeNull();
    expect(fields).toEqual([
      { key: "cc", label: "Cc", value: "a@x.com, b@x.com" },
      { key: "count", label: "Count", value: "12" },
    ]);
  });

  it("reads the action's arguments, which is how the backend sends them", () => {
    const { preview, fields } = splitDetails({ arguments: { to: "maya@acme.com", subject: "Moving today’s 3pm", body: "Hi Maya" } });
    expect(preview).toBe("Hi Maya");
    expect(fields.map((f) => f.label)).toEqual(["To", "Subject"]);
  });

  it("handles a missing details object", () => {
    expect(splitDetails(undefined)).toEqual({ preview: null, fields: [] });
  });
});

describe("approvalQuestion", () => {
  it("is Tex's question above the card", () => {
    expect(approvalQuestion("I'd like to send an email to x@acme.com with subject \"Test\". Approve or Deny below.")).toBe(
      "I'd like to send an email to x@acme.com with subject \"Test\". Approve or Deny below.",
    );
  });

  it("leaves an older ask, which only repeated the card's summary, to the card", () => {
    expect(approvalQuestion("Approval needed: Send this email to Maya")).toBeNull();
    expect(approvalQuestion("  ")).toBeNull();
  });
});

describe("an answered approval", () => {
  it("says the user's own answer only for a yes or a no", () => {
    expect(APPROVAL_RESULT.approved.text).toBe("You approved this");
    expect(APPROVAL_RESULT.rejected.text).toBe("You denied this");
    // Tex asked again with corrected details: that is not the user's no.
    expect(APPROVAL_RESULT.replaced).toEqual({ text: "Replaced by a newer request", tone: "muted", icon: null });
    expect(APPROVAL_RESULT.expired.text).not.toMatch(/^You /);
  });

  it("never claims more than the answer", () => {
    expect(approvalOutcome("approved")).toBe("Tex was told to go ahead.");
    expect(approvalOutcome("replaced")).toContain("Nothing was done with it");
    expect(approvalOutcome("rejected")).toBe("Tex didn’t do this.");
    expect(approvalOutcome("expired")).toContain("Nothing was done");
  });
});

describe("ownAction", () => {
  it("reads the agent's own actions from the kind and the details", () => {
    expect(ownAction({ kind: "command", details: { tool: "Bash", target: "curl x", why: "it reaches the internet", folder: "/w" } })).toEqual({
      kind: "command",
      tool: "Bash",
      target: "curl x",
      why: "it reaches the internet",
      folder: "/w",
    });
    expect(ownAction({ kind: "git_push", details: { repo: "acme/web", branch: "dev", force: true } })).toEqual({ kind: "git_push", repo: "acme/web", branch: "dev", force: true });
    expect(ownAction({ kind: "crew_rerun", details: { job: "J", items: ["a", 3, "b"] } })).toEqual({ kind: "crew_rerun", job: "J", items: ["a", "b"] });
  });

  it("is null for an app's action, or when the details are missing", () => {
    expect(ownAction({ kind: "app_action", details: { arguments: { to: "x" } } })).toBeNull();
    expect(ownAction({ kind: "command", details: {} })).toBeNull();
    expect(ownAction({ kind: "git_push", details: { repo: "a/b" } })).toBeNull();
  });

  it("names why Tex asks", () => {
    expect(approvalReasonOf({ kind: "command", action: "TEXTCREW_RUN_COMMAND", details: { tool: "Bash", target: "x" } }).label).toBe("Runs a command");
    expect(approvalReasonOf({ kind: "command", action: "TEXTCREW_RUN_COMMAND", details: { tool: "Write", target: "/x" } }).label).toBe("Changes a file");
    expect(approvalReasonOf({ kind: "git_push", action: "TEXTCREW_GIT_PUSH", details: { repo: "a/b", branch: "c", force: true } })).toEqual({ label: "Rewrites a branch", tone: "danger" });
    expect(approvalReasonOf({ kind: "app_action", action: "GMAIL_SEND_EMAIL", details: {} }).label).toBe("Sends to someone else");
  });
});

describe("webApprovalLine", () => {
  it("shortens the backend's long ask to one line", () => {
    expect(webApprovalLine('I\'d like to run this command: curl -s "https://x.example/' + "a".repeat(200) + '". Approve or Deny below.')).toBe("I need your OK for this.");
  });
  it("keeps a short message as it is, and leaves old asks to the card", () => {
    expect(webApprovalLine("Should I go ahead?")).toBe("Should I go ahead?");
    expect(webApprovalLine("Approval needed: Send it")).toBeNull();
  });
});

describe("Don't ask again (skip rules)", () => {
  const email = { actionName: "Send email", recipients: ["maya@acme.com"], target: "people" as const, scopes: ["listed" as const, "anyone" as const] };

  it("offers only to the card’s recipients first, then anyone with a one-line warning", () => {
    const [only, anyone] = skipChoices(email);
    expect(only).toEqual({ scope: "listed", label: "Only to maya@acme.com", hint: "Anyone else still asks, also in cc or bcc.", warning: null });
    expect(anyone).toMatchObject({ scope: "anyone", label: "Anyone", warning: "Tex could send email to anyone without asking you." });
  });

  it("says repositories for GitHub, and a post that names nobody can only be for anyone", () => {
    const [only, any] = skipChoices({ actionName: "Create an issue comment", recipients: ["acme/web"], target: "repository", scopes: ["listed", "anyone"] });
    expect(only.label).toBe("Only in acme/web");
    expect(any).toMatchObject({ label: "Any repository", warning: "Tex could create an issue comment in any of your repositories without asking you." });
    const post = skipChoices({ actionName: "Create linked in post", recipients: [], target: "people", scopes: ["anyone"] });
    expect(post).toHaveLength(1);
    expect(post[0].warning).toBe("Tex could create linked in post without asking you, where everyone can see it.");
    expect(skipChoices({ actionName: "Close an issue", recipients: [], target: "repository", scopes: ["action"] })[0]).toMatchObject({ label: "Every time", warning: null });
  });

  it("keeps a long list short on the card", () => {
    expect(recipientList(["a@x.com"])).toBe("a@x.com");
    expect(recipientList(["a@x.com", "b@x.com"])).toBe("a@x.com and b@x.com");
    expect(recipientList(["a@x.com", "b@x.com", "c@x.com", "d@x.com"])).toBe("a@x.com, b@x.com and 2 more");
  });

  it("words a rule's scope and the toast after saving one", () => {
    expect(ruleScopeLine({ action: "GMAIL_SEND_EMAIL", scope: "listed", recipients: ["a@x.com", "b@x.com"] })).toBe("Only to a@x.com, b@x.com");
    expect(ruleScopeLine({ action: "GMAIL_SEND_EMAIL", scope: "anyone", recipients: [] })).toBe("To anyone");
    expect(ruleScopeLine({ action: "GITHUB_CLOSE_AN_ISSUE", scope: "listed", recipients: ["acme/web"] })).toBe("Only in acme/web");
    expect(ruleScopeLine({ action: "GITHUB_CLOSE_AN_ISSUE", scope: "anyone", recipients: [] })).toBe("In any repository");
    expect(ruleScopeLine({ action: "GOOGLECALENDAR_UPDATE_EVENT", scope: "action", recipients: [] })).toBe("Every time it names nobody");
    expect(ruleSavedToast({ action: "GMAIL_SEND_EMAIL", actionName: "Send email", scope: "anyone", recipients: [] }).body).toBe(
      "Send email to anyone. It’s under Skip rules on the Approvals page, where you can remove it.",
    );
  });

  it("says how a run went, and what an auto-approved one is", () => {
    expect(runLine({ state: "done", at: "2026-10-17T08:00:00Z", result: "{}", error: null, creditsCharged: 1 })).toEqual({ text: "Done · 1 credit", tone: "success" });
    expect(runLine({ state: "failed", at: "2026-10-17T08:00:00Z", result: null, error: "Invalid recipient", creditsCharged: 0 })).toEqual({
      text: "Didn’t go through, so nothing was done: Invalid recipient",
      tone: "danger",
    });
    expect(runLine({ state: "running", at: "2026-10-17T08:00:00Z", result: null, error: null, creditsCharged: 0 }).tone).toBe("muted");
    expect(APPROVAL_RESULT.auto_approved.text).toBe("Ran without asking, by your skip rule");
    expect(approvalOutcome("auto_approved")).toBe("Nobody was asked: your skip rule covered it, so it ran at once.");
  });
});
