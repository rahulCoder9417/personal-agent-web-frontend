import { describe, expect, it } from "vitest";
import { describeLedgerEntry } from "./credits-ledger-text";

describe("describeLedgerEntry", () => {
  it("puts an app action into words and says what kind of charge it is", () => {
    expect(describeLedgerEntry({ reason: "charge", description: "App action: GMAIL_SEND_EMAIL" })).toEqual({
      what: "Gmail: send email",
      reason: "app action",
    });
    expect(describeLedgerEntry({ reason: "charge", description: "App action: GOOGLECALENDAR_CREATE_EVENT" }).what).toBe(
      "Google Calendar: create event",
    );
  });

  it("names the parts of a usage charge the way the rest of the app does", () => {
    expect(describeLedgerEntry({ reason: "charge", description: "Usage: AI 3, awake time 1" })).toEqual({
      what: "Textcrew AI 3, running time 1",
      reason: "used",
    });
    expect(describeLedgerEntry({ reason: "charge", description: "Usage: awake time 2, browser 6" }).what).toBe("Running time 2, browser use 6");
    // One thing charged: its name is enough, the amount has its own column.
    expect(describeLedgerEntry({ reason: "charge", description: "Usage: awake time 43" }).what).toBe("Running time");
    expect(describeLedgerEntry({ reason: "charge", description: "Usage: browser 6" }).what).toBe("Browser use");
    expect(describeLedgerEntry({ reason: "charge", description: "Usage: none" }).what).toBe("Usage");
  });

  it("says a web search is a paid tool, apart from browser use", () => {
    expect(describeLedgerEntry({ reason: "charge", description: "Web search" })).toEqual({ what: "Web search", reason: "paid tool" });
    expect(describeLedgerEntry({ reason: "reversal", description: "Web search" })).toEqual({ what: "Web search", reason: "reversed" });
    expect(describeLedgerEntry({ reason: "refund", description: "Failed turn refunded (paid tools)" })).toEqual({
      what: "Failed turn refunded (paid tools)",
      reason: "refund",
    });
  });

  it("keeps a reversed app action readable", () => {
    expect(describeLedgerEntry({ reason: "reversal", description: "App action: SLACK_SEND_MESSAGE" })).toEqual({
      what: "Slack: send message",
      reason: "reversed",
    });
  });

  it("leaves every other line as the backend wrote it", () => {
    expect(describeLedgerEntry({ reason: "grant", description: "Pro monthly credits" })).toEqual({ what: "Pro monthly credits", reason: "added" });
    expect(describeLedgerEntry({ reason: "charge", description: "Task: moved meeting + emailed Priya" }).what).toBe("Task: moved meeting + emailed Priya");
    expect(describeLedgerEntry({ reason: "expire" })).toEqual({ what: "Credits", reason: "expired" });
  });
});
