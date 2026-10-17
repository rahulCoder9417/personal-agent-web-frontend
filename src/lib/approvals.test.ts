import { describe, expect, it } from "vitest";
import { APPROVAL_RESULT, approvalOutcome, approvalQuestion, approvalReason, webApprovalLine, approvalReasonOf, ownAction, splitDetails } from "./approvals";

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
