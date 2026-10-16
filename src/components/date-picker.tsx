"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addDays, addMonths, calendarKey, formatDayLong, formatDayShort, isDay, localToday, monthGrid, monthOf, monthTitle, WEEKDAY_SHORT, type Day } from "@/lib/calendar";
import { cn } from "@/lib/format";
import { CalendarIcon, ChevronRightIcon } from "./icons";
import { FIELD, FIELD_DISABLED, FIELD_FOCUS, FIELD_FOCUS_VISIBLE, Floating, usePopover } from "./select";

/**
 * A day, in the app's own look instead of the browser's date field: a button that shows "Tue 20 Oct
 * 2026" and opens a month to pick from, with Today and Tomorrow at hand. It follows WAI-ARIA's date
 * picker dialog: the keys go into the month, where the arrows move a day or a week, Page Up and Page
 * Down a month, Home and End the week's ends, Enter chooses, and Escape closes and returns to the
 * button. Days before `min` can't be picked. The value is "YYYY-MM-DD".
 */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  today: todayGiven,
  label = "Day",
  disabled,
  className,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: Day;
  onChange: (value: Day) => void;
  /** The first day that can be picked. */
  min?: Day | null;
  /** Today, where the picker is used (a time zone's today); the browser's own by default. */
  today?: Day;
  label?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const ownId = useId();
  const dialogId = `${id ?? ownId}-calendar`;
  const titleId = `${dialogId}-title`;
  const [open, setOpen] = useState(false);
  const today = todayGiven ?? localToday();
  const start = isDay(value) ? value : (min ?? today);
  const [focus, setFocus] = useState<Day>(start);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const focusing = useRef(false);

  const close = useCallback((back = false) => {
    setOpen(false);
    if (back) trigger.current?.focus();
  }, []);
  const place = usePopover(open, trigger, pop, close, 288);

  // The keys follow the day they are on, into the month as it opens and as they move.
  useEffect(() => {
    if (!open || !place || !focusing.current) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, place, focus]);

  const openIt = () => {
    setFocus(start);
    focusing.current = true;
    setOpen(true);
  };
  const pick = (day: Day) => {
    if (min && day < min) return;
    close(true);
    if (day !== value) onChange(day);
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = calendarKey(event.key, focus, { shift: event.shiftKey, min });
    if (!action) return;
    event.preventDefault();
    if (action.kind === "close") {
      event.stopPropagation();
      close(true);
    } else if (action.kind === "pick") pick(action.day);
    else {
      focusing.current = true;
      setFocus(action.day);
    }
  };

  const shown = monthOf(focus);
  const weeks = monthGrid(shown);
  const canGoBack = !min || monthOf(min) < shown;

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={id ? undefined : `${label}: ${isDay(value) ? formatDayLong(value) : "not chosen"}`}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => (open ? close() : openIt())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openIt();
          }
        }}
        className={cn(FIELD, FIELD_FOCUS_VISIBLE, "pl-2.5", open && FIELD_FOCUS, disabled && FIELD_DISABLED, className)}
      >
        <CalendarIcon size={15} className="shrink-0 text-muted" />
        <span className={cn("min-w-0 flex-1 truncate tabular-nums", !isDay(value) && "text-muted")}>{isDay(value) ? formatDayShort(value) : "Pick a day"}</span>
      </button>
      {place && (
        <Floating place={{ ...place, maxHeight: Math.max(place.maxHeight, 360) }} popRef={pop} scrollRef={grid}>
          <div
            id={dialogId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            className="flex flex-col gap-2 p-2"
            onBlur={(event) => {
              const to = event.relatedTarget as Node | null;
              if (to && !pop.current?.contains(to) && to !== trigger.current) close();
            }}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                tabIndex={-1}
                aria-label="Previous month"
                disabled={!canGoBack}
                onClick={() => setFocus((day) => (min && addMonths(day, -1) < min ? min : addMonths(day, -1)))}
                className="grid size-8 place-items-center rounded-lg text-nav transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
              >
                <ChevronRightIcon size={15} className="rotate-180" />
              </button>
              <p id={titleId} aria-live="polite" className="flex-1 text-center text-[13.5px] font-semibold">
                {monthTitle(shown)}
              </p>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Next month"
                onClick={() => setFocus((day) => addMonths(day, 1))}
                className="grid size-8 place-items-center rounded-lg text-nav transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <ChevronRightIcon size={15} />
              </button>
            </div>
            <div role="grid" aria-labelledby={titleId} onKeyDown={onGridKey} className="flex flex-col gap-0.5">
              <div role="row" className="grid grid-cols-7">
                {WEEKDAY_SHORT.map((name) => (
                  <span key={name} role="columnheader" aria-label={name} className="py-1 text-center text-[11px] font-medium text-muted">
                    {name.slice(0, 2)}
                  </span>
                ))}
              </div>
              {weeks.map((week) => (
                <div key={week[0].day} role="row" className="grid grid-cols-7 gap-0.5">
                  {week.map(({ day, inMonth }) => {
                    const chosen = day === value;
                    const off = Boolean(min && day < min);
                    return (
                      <span key={day} role="gridcell" aria-selected={chosen}>
                        <button
                          type="button"
                          data-day={day}
                          tabIndex={day === focus ? 0 : -1}
                          aria-label={`${formatDayLong(day)}${day === today ? ", today" : ""}`}
                          aria-disabled={off || undefined}
                          onClick={() => pick(day)}
                          onFocus={() => {
                            focusing.current = true;
                            if (day !== focus) setFocus(day);
                          }}
                          className={cn(
                            "grid h-9 w-full place-items-center rounded-lg text-[13px] tabular-nums transition-colors outline-none",
                            "focus-visible:shadow-[0_0_0_2px_var(--accent)]",
                            chosen ? "bg-accent font-semibold text-white" : off ? "cursor-default text-muted/50" : "hover:bg-surface-2",
                            !chosen && !off && (inMonth ? "text-fg" : "text-muted"),
                            day === today && !chosen && "font-semibold text-accent-dark ring-1 ring-accent/40 ring-inset",
                          )}
                        >
                          {Number(day.slice(8))}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 border-t border-line pt-2">
              {[
                { day: today, word: "Today" },
                { day: addDays(today, 1), word: "Tomorrow" },
              ].map(({ day, word }) => (
                <button
                  key={word}
                  type="button"
                  disabled={Boolean(min && day < min)}
                  onClick={() => pick(day)}
                  className="h-7 rounded-md px-2 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        </Floating>
      )}
    </>
  );
}
