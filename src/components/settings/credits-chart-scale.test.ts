import { describe, expect, it } from "vitest";
import type { UsagePeriod } from "@/lib/api/client";
import { niceScale, SERIES, seriesTotal, seriesValue, stackColumn, visibleSeries } from "./credits-chart-scale";

function day(awake: number, tools: number, ai = 0, actions = 0, browser = 0, wake = 0): UsagePeriod {
  return {
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-10-02T00:00:00Z",
    awakeCredits: awake,
    wakeCredits: wake,
    appActionCredits: actions,
    browserCredits: browser,
    toolCredits: tools,
    aiCredits: ai,
    totalCredits: awake + wake + actions + browser + tools + ai,
  };
}

describe("niceScale", () => {
  it("ends the axis on a round number with clean ticks", () => {
    expect(niceScale(62)).toEqual({ max: 80, step: 20, ticks: [0, 20, 40, 60, 80] });
    expect(niceScale(100)).toEqual({ max: 100, step: 25, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale(1850).ticks).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("never uses a step smaller than one credit", () => {
    expect(niceScale(3)).toEqual({ max: 3, step: 1, ticks: [0, 1, 2, 3] });
    expect(niceScale(1).ticks).toEqual([0, 1]);
  });

  it("still gives an empty chart an axis", () => {
    expect(niceScale(0).ticks).toEqual([0, 1, 2, 3, 4]);
    expect(niceScale(-5).max).toBe(4);
  });

  it("always covers the data", () => {
    for (const value of [1, 7, 13, 49, 51, 99, 101, 379, 12_345]) {
      const scale = niceScale(value);
      expect(scale.max).toBeGreaterThanOrEqual(value);
      expect(scale.ticks.at(-1)).toBe(scale.max);
    }
  });
});

describe("visibleSeries", () => {
  it("drops a series that is zero on every day but keeps the order of the rest", () => {
    expect(visibleSeries([day(10, 4), day(0, 0)]).map((s) => s.id)).toEqual(["awake", "tools"]);
    expect(visibleSeries([day(0, 2, 5)]).map((s) => s.id)).toEqual(["tools", "ai"]);
    expect(visibleSeries([])).toEqual([]);
  });

  it("stacks app actions on top of running time", () => {
    expect(visibleSeries([day(3, 0, 2, 4)]).map((s) => s.id)).toEqual(["awake", "actions", "ai"]);
  });

  it("shows wake fees as their own series, beside running time", () => {
    expect(visibleSeries([day(3, 0, 0, 0, 0, 1)]).map((s) => s.id)).toEqual(["awake", "wake"]);
    expect(seriesValue(day(3, 0, 0, 0, 0, 2), "wake")).toBe(2);
  });

  it("keeps browser use and paid tools apart", () => {
    expect(visibleSeries([day(3, 0, 0, 0, 6)]).map((s) => s.id)).toEqual(["awake", "browser"]);
    expect(visibleSeries([day(3, 2, 0, 0, 6), day(1, 0)]).map((s) => s.id)).toEqual(["awake", "browser", "tools"]);
  });
});

describe("SERIES", () => {
  it("names the six things credits are spent on, each in its own colour", () => {
    expect(SERIES.map((s) => s.label)).toEqual(["Running time", "Waking up", "App actions", "Browser use", "Paid tools", "Textcrew AI"]);
    expect(new Set(SERIES.map((s) => s.color)).size).toBe(SERIES.length);
  });
});

describe("seriesValue and seriesTotal", () => {
  it("read each series from its own field", () => {
    const period = day(1, 2, 3, 4, 5, 6);
    expect(SERIES.map((s) => seriesValue(period, s.id))).toEqual([1, 6, 4, 5, 2, 3]);
    expect(SERIES.map((s) => seriesTotal(period, s.id))).toEqual([1, 6, 4, 5, 2, 3]);
    // The six add up to the total: nothing is counted twice.
    expect(SERIES.reduce((sum, s) => sum + seriesValue(period, s.id), 0)).toBe(period.totalCredits);
  });
});

describe("stackColumn", () => {
  it("sizes segments against the axis and takes the gap out of the upper ones", () => {
    const segments = stackColumn(day(40, 20), SERIES, 80, 160);
    expect(segments.map((s) => [s.id, s.height, s.top])).toEqual([
      ["awake", 80, false],
      ["tools", 38, true],
    ]);
  });

  it("skips empty series and rounds only the topmost segment", () => {
    const segments = stackColumn(day(0, 10), SERIES, 80, 160);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ id: "tools", height: 20, top: true });
    expect(stackColumn(day(0, 0), SERIES, 80, 160)).toEqual([]);
  });

  it("keeps a tiny value visible", () => {
    expect(stackColumn(day(1, 0), SERIES, 2000, 160)[0].height).toBe(2);
  });
});
