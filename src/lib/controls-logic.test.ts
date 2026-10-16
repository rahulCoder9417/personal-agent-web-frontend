import { describe, expect, it } from "vitest";
import { addDays, addMonths, calendarKey, formatDayLong, formatDayShort, isDay, monthGrid, weekdayOf } from "./calendar";
import { toggleValue } from "./listbox";
import { rovingKey, tabStop } from "./roving";
import { formatTime, parseTime, timeOptions } from "./time-of-day";

// The rules behind the app's own controls (segmented control, time and date pickers, several at
// once), without a browser. What they draw and how the keys work in a page is in
// src/components/controls.test.ts.

describe("a radio group's keys (rovingKey)", () => {
  const none = [false, false, false];
  it("moves with the arrows and goes round at the ends", () => {
    expect(rovingKey("ArrowRight", 0, none)).toBe(1);
    expect(rovingKey("ArrowDown", 2, none)).toBe(0);
    expect(rovingKey("ArrowLeft", 0, none)).toBe(2);
    expect(rovingKey("ArrowUp", 1, none)).toBe(0);
  });
  it("goes to the ends with Home and End, and leaves other keys alone", () => {
    expect(rovingKey("Home", 2, none)).toBe(0);
    expect(rovingKey("End", 0, none)).toBe(2);
    expect(rovingKey("a", 0, none)).toBeNull();
    expect(rovingKey("Enter", 0, none)).toBeNull();
  });
  it("skips what can't be picked, and keeps to its direction", () => {
    expect(rovingKey("ArrowRight", 0, [false, true, false])).toBe(2);
    expect(rovingKey("Home", 2, [true, false, false])).toBe(1);
    expect(rovingKey("ArrowDown", 0, none, "horizontal")).toBeNull();
    expect(rovingKey("ArrowRight", 0, none, "vertical")).toBeNull();
  });
  it("puts Tab on the chosen one, else the first that can be picked", () => {
    expect(tabStop(2, none)).toBe(2);
    expect(tabStop(-1, [true, false, false])).toBe(1);
    expect(tabStop(0, [true, false, false])).toBe(1);
  });
});

describe("a time of day", () => {
  it("reads what people type", () => {
    expect(parseTime("9")).toBe("09:00");
    expect(parseTime("9am")).toBe("09:00");
    expect(parseTime("9 pm")).toBe("21:00");
    expect(parseTime("930")).toBe("09:30");
    expect(parseTime("9.30pm")).toBe("21:30");
    expect(parseTime("21:15")).toBe("21:15");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("12pm")).toBe("12:00");
    expect(parseTime("noon")).toBe("12:00");
  });
  it("says no to what isn't a time", () => {
    for (const text of ["", "25:00", "13pm", "9:75", "soon", "0am"]) expect(parseTime(text)).toBeNull();
  });
  it("shows it on a 12-hour clock", () => {
    expect(formatTime("09:00")).toBe("9:00 AM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("18:30")).toBe("6:30 PM");
  });
  it("offers the day's quarter hours, the chosen one included, and what was typed first", () => {
    const all = timeOptions("08:07", null);
    expect(all).toHaveLength(97);
    expect(all.map((option) => option.value)).toContain("08:07");
    expect(all[0].label).toBe("12:00 AM");
    const typed = timeOptions("09:00", "7:10pm");
    expect(typed[0]).toMatchObject({ value: "19:10", label: "7:10 PM", hint: "Typed" });
    expect(timeOptions("09:00", "93")[0].value).toBe("09:30");
    expect(timeOptions("09:00", "6pm").every((option) => option.value >= "12:00")).toBe(true);
    expect(timeOptions("09:00", "zz")).toEqual([]);
  });
});

describe("a day on the calendar", () => {
  it("knows a real day from a wrong one", () => {
    expect(isDay("2026-10-20")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("20/10/2026")).toBe(false);
  });
  it("counts days and months, keeping to a shorter month's end", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-15", -12)).toBe("2025-03-15");
    expect(weekdayOf("2026-10-19")).toBe(0); // a Monday
  });
  it("lays out a month in weeks from Monday, with the days around it", () => {
    const weeks = monthGrid("2026-10-16");
    expect(weeks[0][0]).toEqual({ day: "2026-09-28", inMonth: false });
    expect(weeks[0][3]).toEqual({ day: "2026-10-01", inMonth: true });
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.at(-1)!.some((cell) => cell.day === "2026-10-31")).toBe(true);
  });
  it("says a day in words", () => {
    expect(formatDayShort("2026-10-20")).toBe("Tue 20 Oct 2026");
    expect(formatDayLong("2026-10-20")).toBe("Tuesday 20 October 2026");
  });
  it("moves with the keys of a date picker, never before the first day allowed", () => {
    expect(calendarKey("ArrowRight", "2026-10-20")).toEqual({ kind: "move", day: "2026-10-21" });
    expect(calendarKey("ArrowDown", "2026-10-20")).toEqual({ kind: "move", day: "2026-10-27" });
    expect(calendarKey("Home", "2026-10-21")).toEqual({ kind: "move", day: "2026-10-19" });
    expect(calendarKey("End", "2026-10-21")).toEqual({ kind: "move", day: "2026-10-25" });
    expect(calendarKey("PageDown", "2026-10-31")).toEqual({ kind: "move", day: "2026-11-30" });
    expect(calendarKey("PageUp", "2026-10-20", { shift: true })).toEqual({ kind: "move", day: "2025-10-20" });
    expect(calendarKey("ArrowLeft", "2026-10-16", { min: "2026-10-16" })).toEqual({ kind: "move", day: "2026-10-16" });
    expect(calendarKey("Enter", "2026-10-20")).toEqual({ kind: "pick", day: "2026-10-20" });
    expect(calendarKey("Escape", "2026-10-20")).toEqual({ kind: "close" });
    expect(calendarKey("x", "2026-10-20")).toBeNull();
  });
});

describe("several at once (toggleValue)", () => {
  it("ticks at the end and unticks in place", () => {
    expect(toggleValue(["gmail"], "github")).toEqual(["gmail", "github"]);
    expect(toggleValue(["gmail", "github", "slack"], "github")).toEqual(["gmail", "slack"]);
  });
});
