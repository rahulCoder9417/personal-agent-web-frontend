import { describe, expect, it } from "vitest";
import { gmtOffset, timezoneOptions } from "./timezones";

const AT = new Date("2026-10-01T12:00:00Z");

describe("timezoneOptions", () => {
  it("labels each zone with its offset", () => {
    const options = timezoneOptions("Asia/Kolkata", ["Asia/Kolkata", "America/New_York"], AT);
    expect(options).toEqual([
      { value: "Asia/Kolkata", label: "Asia/Kolkata (GMT+5:30)" },
      { value: "America/New_York", label: "America/New York (GMT-4)" },
    ]);
  });

  it("keeps the account's zone even when the runtime doesn't list it", () => {
    const options = timezoneOptions("Asia/Calcutta", ["Europe/London"], AT);
    expect(options[0].value).toBe("Asia/Calcutta");
    expect(options).toHaveLength(2);
  });

  it("survives a zone it can't resolve", () => {
    expect(gmtOffset("Nowhere/Land", AT)).toBe("");
    expect(timezoneOptions("Nowhere/Land", [], AT)).toEqual([{ value: "Nowhere/Land", label: "Nowhere/Land" }]);
  });
});
