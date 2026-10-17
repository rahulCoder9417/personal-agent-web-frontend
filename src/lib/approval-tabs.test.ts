import { describe, expect, it } from "vitest";
import { APPROVAL_EMPTY, APPROVAL_TABS } from "./approval-tabs";

describe("the Approvals screen's tabs", () => {
  it("has Replaced, then Auto-approved after the others, so a replaced request and a skipped one can be found", () => {
    expect(APPROVAL_TABS.map((tab) => tab.label)).toEqual(["Pending", "Approved", "Denied", "Expired", "Replaced", "Auto-approved"]);
    expect(APPROVAL_TABS.at(-1)).toEqual({ value: "auto_approved", label: "Auto-approved" });
  });

  it("says in plain words what an empty Auto-approved tab means and how a rule is made", () => {
    expect(APPROVAL_EMPTY.auto_approved.title).toBe("Nothing ran without asking");
    expect(APPROVAL_EMPTY.auto_approved.body).toContain("“Don’t ask again for this…”");
    expect(APPROVAL_EMPTY.auto_approved.body).toContain("what ran, when, by which rule, and how it went");
  });

  it("says in plain words what an empty Replaced tab means: nothing was done with them", () => {
    expect(APPROVAL_EMPTY.replaced.title).toBe("Nothing replaced");
    expect(APPROVAL_EMPTY.replaced.body).toContain("Nothing was done with it");
    for (const tab of APPROVAL_TABS) expect(APPROVAL_EMPTY[tab.value].title).toBeTruthy();
  });
});
