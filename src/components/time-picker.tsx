"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/format";
import { comboboxKey, firstEnabled, indexOfValue } from "@/lib/listbox";
import { useMediaQuery } from "@/lib/media-query";
import { formatTime, parseTime, timeOptions } from "@/lib/time-of-day";
import { ClockIcon } from "./icons";
import { FIELD, FIELD_DISABLED, FIELD_FOCUS, FIELD_FOCUS_WITHIN, Floating, OptionList, optionId, reveal, SHEET_BELOW, usePopover } from "./select";

/**
 * A time of day, in the app's own look instead of the browser's time field. It shows "9:00 AM";
 * a click opens the day's times every quarter of an hour, with the chosen one in the middle, and
 * typing narrows them or names any time at all ("930", "9:07 pm", "21:15"). Enter, or leaving the
 * field with a time typed, chooses it; Escape puts back what was there. The value is "HH:MM".
 * The keys are the Combobox's (see `comboboxKey`).
 */
export function TimePicker({
  id,
  value,
  onChange,
  label = "Time",
  step = 15,
  disabled,
  className,
  "aria-describedby": describedBy,
}: {
  id?: string;
  /** "HH:MM", 24-hour. */
  value: string;
  onChange: (value: string) => void;
  /** What a screen reader calls it when no `<label>` points at it. */
  label?: string;
  /** Minutes between the times offered. */
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const ownId = useId();
  const listId = `${id ?? ownId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState<string | null>(null);
  const narrow = useMediaQuery(SHEET_BELOW);
  const options = useMemo(() => timeOptions(value, query, step), [value, query, step]);
  const selected = indexOfValue(options, value);

  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    setQuery(null);
  }, []);
  const place = usePopover(open, field, pop, close, 168);

  const choose = (next: string | null | undefined) => {
    close();
    if (next && next !== value) onChange(next);
  };

  const openAt = (index: number) => {
    opened.current = true;
    setActive(index);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    if (reveal(scroller.current, listId, active, opened.current)) opened.current = false;
  }, [open, active, listId, place]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter with a time typed but no option under the keys still chooses what was typed.
    if (event.key === "Enter" && query !== null && active < 0) {
      event.preventDefault();
      choose(parseTime(query));
      return;
    }
    const result = comboboxKey(event, options, { open, active, selected });
    if (result.prevent) event.preventDefault();
    const { action } = result;
    if (action.kind === "open") openAt(action.active);
    else if (action.kind === "move") setActive(action.active);
    else if (action.kind === "pick") choose(options[action.index]?.value);
    else if (action.kind === "close") {
      if (event.key === "Escape") event.stopPropagation();
      // Tab moves on with what was typed, as leaving the field does.
      if (event.key === "Tab" && query !== null) choose(parseTime(query));
      else close();
    }
  };

  return (
    <>
      <div
        ref={field}
        className={cn(FIELD, "cursor-text pr-1.5 pl-2.5", open ? FIELD_FOCUS : FIELD_FOCUS_WITHIN, disabled && FIELD_DISABLED, className)}
        onMouseDown={(event) => {
          if (disabled || event.button !== 0 || event.target === input.current) return;
          event.preventDefault();
          if (open) return close();
          input.current?.focus();
          openAt(indexOfValue(options, value));
        }}
      >
        <ClockIcon size={15} className="shrink-0 text-muted" />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
          aria-label={id ? undefined : label}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          disabled={disabled}
          value={query ?? formatTime(value)}
          placeholder="9:00 AM"
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => {
            if (open) return;
            event.currentTarget.select();
            openAt(indexOfValue(options, value));
          }}
          onChange={(event) => {
            const text = event.target.value;
            setQuery(text);
            opened.current = true;
            setActive(firstEnabled(timeOptions(value, text, step)));
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (pop.current?.contains(event.relatedTarget as Node | null)) return;
            if (query !== null) choose(parseTime(query));
            else close();
          }}
          className="h-full w-full min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted/80 disabled:text-muted"
        />
      </div>
      {place && (
        <Floating place={place} popRef={pop} scrollRef={scroller}>
          {options.length === 0 ? (
            <p role="status" className="px-2.5 py-2 text-[13px] text-muted">
              Type a time, such as 9:30 or 6pm.
            </p>
          ) : (
            <OptionList id={listId} items={options} value={value} active={active} label={label} roomy={narrow} onActive={setActive} onPick={(index) => choose(options[index]?.value)} />
          )}
        </Floating>
      )}
    </>
  );
}
