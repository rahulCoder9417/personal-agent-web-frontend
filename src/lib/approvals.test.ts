import { describe, expect, it } from "vitest";
import { approvalQuestion, approvalReason, splitDetails } from "./approvals";

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
