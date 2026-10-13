import { describe, expect, it } from "vitest";
import { filterItems, type ListOption } from "@/lib/listbox";
import { gmtOffset, timezoneOptions } from "./timezones";

const AT = new Date("2026-10-01T12:00:00Z");

describe("timezoneOptions", () => {
  it("names each zone in words, with its offset beside it", () => {
    const options = timezoneOptions("Asia/Kolkata", ["Asia/Kolkata", "America/New_York"], AT);
    expect(options).toEqual([
      { value: "Asia/Kolkata", label: "Asia/Kolkata", hint: "GMT+5:30" },
      { value: "America/New_York", label: "America/New York", hint: "GMT-4" },
    ]);
  });

  it("is found by a city, by part of its name and by its offset", () => {
    const options = timezoneOptions("Asia/Kolkata", ["Asia/Kolkata", "America/New_York", "Europe/London"], AT);
    expect(filterItems(options, "new york").map((option) => (option as ListOption).value)).toEqual(["America/New_York"]);
    expect(filterItems(options, "kolk").map((option) => (option as ListOption).value)).toEqual(["Asia/Kolkata"]);
    expect(filterItems(options, "+5:30").map((option) => (option as ListOption).value)).toEqual(["Asia/Kolkata"]);
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
