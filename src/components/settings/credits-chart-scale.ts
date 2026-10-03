// The maths behind the usage chart, kept apart from the markup so it can be unit tested.

import type { UsagePeriod, UsageTotals } from "@/lib/api/client";

export type SeriesId = "awake" | "actions" | "tools" | "ai";

export type Series = { id: SeriesId; label: string; color: string };

/**
 * Fixed order and colours; a series keeps its colour whatever else is on screen. The four were
 * validated as a set, every pair against every other, because a day's column leaves out what it
 * didn't use, so any two can end up touching.
 */
export const SERIES: readonly Series[] = [
  { id: "awake", label: "Running time", color: "#3355F5" },
  { id: "actions", label: "App actions", color: "#C22866" },
  // One number in the API: minutes in the browser (Max plan) and tools that cost money.
  { id: "tools", label: "Browser use and paid tools", color: "#FF6B2C" },
  { id: "ai", label: "Textcrew AI", color: "#11A39B" },
];

const FIELD = {
  awake: "awakeCredits",
  actions: "appActionCredits",
  tools: "toolCredits",
  ai: "aiCredits",
} as const satisfies Record<SeriesId, keyof UsageTotals>;

const STEPS = [1, 2, 2.5, 5, 10];

/**
 * A y axis that ends on a round number: `niceScale(63)` → max 80, ticks 0/20/40/60/80.
 * Always returns at least a 0..4 axis so an empty chart still has gridlines.
 */
export function niceScale(dataMax: number, targetTicks = 4): { max: number; step: number; ticks: number[] } {
  const top = Math.max(dataMax, 0);
  if (top === 0) return { max: 4, step: 1, ticks: [0, 1, 2, 3, 4] };

  const rough = top / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // Credits are whole numbers, so the step never drops below 1.
  const step = Math.max(1, (STEPS.find((s) => s * magnitude >= rough) ?? 10) * magnitude);
  const max = Math.ceil(top / step) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(Math.round(value * 100) / 100);
  return { max, step, ticks };
}

export function seriesValue(period: UsagePeriod, id: SeriesId): number {
  return period[FIELD[id]];
}

export function seriesTotal(totals: UsageTotals, id: SeriesId): number {
  return totals[FIELD[id]];
}

/** Series worth drawing: one that is zero on every day is left out of the stack (it stays in the totals). */
export function visibleSeries(periods: readonly UsagePeriod[]): Series[] {
  return SERIES.filter((s) => periods.some((p) => seriesValue(p, s.id) > 0));
}

export type Segment = { id: SeriesId; color: string; value: number; height: number; top: boolean };

const GAP = 2;
const MIN_SEGMENT = 2;

/**
 * One day's column, bottom segment first. Heights are in px for a plot `plotHeight` tall whose axis
 * ends at `axisMax`; the 2px gaps between segments are taken out of the segments, so the column's
 * full height still reads true against the gridlines.
 */
export function stackColumn(period: UsagePeriod, series: readonly Series[], axisMax: number, plotHeight: number): Segment[] {
  const present = series
    .map((s) => ({ id: s.id, color: s.color, value: seriesValue(period, s.id) }))
    .filter((s) => s.value > 0);

  return present.map((s, index) => {
    const raw = (s.value / axisMax) * plotHeight;
    const gap = index > 0 ? GAP : 0;
    return {
      ...s,
      height: Math.max(MIN_SEGMENT, Math.round(raw - gap)),
      top: index === present.length - 1,
    };
  });
}
