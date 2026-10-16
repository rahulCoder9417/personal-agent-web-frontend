import { describe, expect, it } from "vitest";
import { APPROVAL_EMPTY, APPROVAL_TABS } from "./approval-tabs";

describe("the Approvals screen's tabs", () => {
  it("has a Replaced tab after the others, so a replaced request can be found", () => {
    expect(APPROVAL_TABS.map((tab) => tab.label)).toEqual(["Pending", "Approved", "Denied", "Expired", "Replaced"]);
    expect(APPROVAL_TABS.at(-1)).toEqual({ value: "replaced", label: "Replaced" });
  });

  it("says in plain words what an empty Replaced tab means: nothing was done with them", () => {
    expect(APPROVAL_EMPTY.replaced.title).toBe("Nothing replaced");
    expect(APPROVAL_EMPTY.replaced.body).toContain("Nothing was done with it");
    for (const tab of APPROVAL_TABS) expect(APPROVAL_EMPTY[tab.value].title).toBeTruthy();
  });
});
