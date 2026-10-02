"use client";

import { useState } from "react";
import type { UsagePeriod, UsageTotals } from "@/lib/api/client";
import { cn, formatDate, formatNumber } from "@/lib/format";
import { niceScale, SERIES, seriesTotal, seriesValue, stackColumn, visibleSeries } from "./credits-chart-scale";

const PLOT = 160;

function Tooltip({ period, align, bottom }: { period: UsagePeriod; align: "left" | "center" | "right"; bottom: number }) {
  return (
    <span
      role="presentation"
      className={cn(
        "pointer-events-none absolute z-10 flex w-max flex-col gap-0.5 rounded-lg bg-fg px-2.5 py-2 text-left text-[12px] text-white",
        align === "left" && "left-0",
        align === "center" && "left-1/2 -translate-x-1/2",
        align === "right" && "right-0",
      )}
      style={{ bottom }}
    >
      <span className="font-medium">{formatDate(period.periodStart)}</span>
      {SERIES.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: s.color }} />
          <span className="opacity-80">{s.label}</span>
          <span className="ml-auto pl-3">{formatNumber(seriesValue(period, s.id))}</span>
        </span>
      ))}
      <span className="mt-0.5 flex border-t border-white/20 pt-1">
        <span className="opacity-80">Total</span>
        <span className="ml-auto pl-3">{formatNumber(period.totalCredits)}</span>
      </span>
    </span>
  );
}

/**
 * Credits used per day as stacked columns. Identity is carried by the legend and the tooltip,
 * values by the axis and the totals row; text is always ink, never a series colour.
 */
export function UsageChart({ periods, totals }: { periods: UsagePeriod[]; totals: UsageTotals }) {
  const [active, setActive] = useState<number | null>(null);
  const series = visibleSeries(periods);
  const scale = niceScale(Math.max(0, ...periods.map((p) => p.totalCredits)));
  const count = periods.length;
  // Label every day when they fit, otherwise every other one; the ends always carry the month.
  const every = count > 16 ? Math.ceil(count / 8) : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Legend and totals: also the table-style reading of the chart */}
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        {SERIES.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            <dt>{s.label}</dt>
            <dd className="text-[12px] font-medium">{formatNumber(seriesTotal(totals, s.id))}</dd>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <dt className="text-muted">Total</dt>
          <dd className="text-[12px] font-semibold">{formatNumber(totals.totalCredits)}</dd>
        </div>
      </dl>

      <div className="flex gap-2.5">
        {/* y axis */}
        <div aria-hidden className="relative w-8 shrink-0" style={{ height: PLOT }}>
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2 text-[11.5px] leading-none text-muted"
              style={{ bottom: (tick / scale.max) * PLOT }}
            >
              {formatNumber(tick)}
            </span>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative" style={{ height: PLOT }} onMouseLeave={() => setActive(null)}>
            {scale.ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden
                className={cn("absolute inset-x-0 h-px", tick === 0 ? "bg-line-strong" : "bg-surface-2")}
                style={{ bottom: (tick / scale.max) * PLOT }}
              />
            ))}

            <div className="absolute inset-0 flex">
              {periods.map((period, index) => {
                const segments = stackColumn(period, series, scale.max, PLOT);
                const on = active === index;
                const label = `${formatDate(period.periodStart)}: ${SERIES.map((s) => `${s.label} ${seriesValue(period, s.id)}`).join(", ")}, total ${period.totalCredits} credits`;
                return (
                  <button
                    key={period.periodStart}
                    type="button"
                    aria-label={label}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      "relative flex min-w-0 flex-1 cursor-default flex-col-reverse items-center gap-[2px] rounded-t-md outline-offset-0",
                      on && "bg-fg/[0.05]",
                    )}
                  >
                    {segments.map((segment) => (
                      <span
                        key={segment.id}
                        aria-hidden
                        className={cn("w-3/5 max-w-6 min-w-1.5 shrink-0", segment.top && "rounded-t-[4px]")}
                        style={{ height: segment.height, background: segment.color }}
                      />
                    ))}
                    {on && (
                      <Tooltip
                        period={period}
                        align={index < 2 ? "left" : index > count - 3 ? "right" : "center"}
                        // Sits just above the column's top, whatever its height
                        bottom={Math.round((period.totalCredits / scale.max) * PLOT) + 8}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* x axis */}
          <div aria-hidden className="flex">
            {periods.map((period, index) => {
              const edge = index === 0 || index === count - 1;
              const show = edge || index % every === 0;
              const date = new Date(period.periodStart);
              return (
                <span key={period.periodStart} className="min-w-0 flex-1 text-center text-[11.5px] whitespace-nowrap text-muted">
                  {show ? (edge ? formatDate(period.periodStart) : date.getDate()) : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
