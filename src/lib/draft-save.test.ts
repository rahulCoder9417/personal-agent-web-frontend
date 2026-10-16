import { describe, expect, it } from "vitest";
import { ApiError, type Automation, type AutomationDraft } from "./api/client";
import { savedNotice, saveRefusal } from "./draft-save";

// What the person is told after Save, from a draft's card or its page.

const NOW = new Date("2026-10-01T14:30:00");
const draft = { title: "Monday pull requests", kind: "repeat", nextRunAt: "2026-10-05T09:00:00" } as const;
const saved = (enabled: boolean) => ({
  draft: { ...draft, id: "drf_1", status: "saved", automationId: "aut_9" } as unknown as AutomationDraft,
  automation: { id: "aut_9", enabled } as Automation,
});

describe("savedNotice", () => {
  it("says it is saved, when it first runs, with the way to it", () => {
    expect(savedNotice(draft, saved(true) as never, NOW)).toEqual({
      kind: "done",
      title: "Saved “Monday pull requests”",
      body: "First run: Mon 5 Oct, 9:00 AM",
      action: { label: "Open", href: "/automations/aut_9" },
    });
  });

  it("says a paused one won't run until it is turned on", () => {
    expect(savedNotice(draft, saved(false) as never, NOW)).toMatchObject({
      title: "Saved “Monday pull requests”, paused",
      body: "It won’t run until you turn it on.",
    });
  });
});

describe("saveRefusal", () => {
  it("is quiet about a draft that is no longer open, but for one already saved", () => {
    expect(saveRefusal(draft, new ApiError(409, "conflict", "This draft is already saved", { status: "saved", automationId: "aut_9" }))).toEqual({
      kind: "done",
      title: "Already saved",
      action: { label: "Open", href: "/automations/aut_9" },
    });
    for (const status of ["replaced", "expired", "discarded"])
      expect(saveRefusal(draft, new ApiError(409, "conflict", "no", { status })).kind).toBe("none");
  });

  it("offers the plans when the plan is full, and says why otherwise", () => {
    expect(saveRefusal(draft, new ApiError(403, "plan_limit", "Your pro plan allows 5 automations"))).toEqual({
      kind: "error",
      title: "Couldn’t save “Monday pull requests”",
      body: "Your pro plan allows 5 automations",
      action: { label: "See plans", href: "/pricing" },
    });
    expect(saveRefusal(draft, new ApiError(400, "invalid_request", "Connect Gmail first"))).toMatchObject({ kind: "error", body: "Connect Gmail first" });
    expect(saveRefusal(draft, new ApiError(503, "unavailable", "Try again in a moment"))).toMatchObject({ kind: "error", body: "Try again in a moment" });
  });
});
