"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { rovingKey, tabStop, type RovingOrientation } from "@/lib/roving";
import { CheckIcon } from "./icons";

// One choice out of a few, drawn in the app's own look instead of radio buttons: `SegmentedControl`
// (a row of segments, for two to four short choices: Once / On a schedule / On an app event) and
// `RadioCards` (a card per choice with a line on what it means). Both are WAI-ARIA radio groups:
// Tab reaches the chosen one, the arrows move and choose, Home and End go to the ends.

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  /** A mark before the label. */
  icon?: ReactNode;
  /** RadioCards: what the choice means, under its label. */
  description?: ReactNode;
  /** A count after the label (a filter's matches). */
  count?: number;
  disabled?: boolean;
};

/** The keys of a radio group, and its tab stop, over the buttons it draws. */
function useRadioGroup<T extends string>(options: readonly ChoiceOption<T>[], value: T | null, onChange: (value: T) => void, orientation: RovingOrientation) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = options.map((option) => Boolean(option.disabled));
  const stop = tabStop(
    options.findIndex((option) => option.value === value),
    disabled,
  );
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingKey(event.key, index, disabled, orientation);
    if (next === null || next < 0) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    if (options[next].value !== value) onChange(options[next].value);
  };
  const ref = (index: number) => (element: HTMLButtonElement | null) => {
    buttons.current[index] = element;
  };
  return { stop, onKeyDown, ref };
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  fill = false,
  wrap = false,
  className,
  "aria-labelledby": labelledBy,
}: {
  /** What a screen reader calls the group, when no heading names it (`aria-labelledby`). */
  label?: string;
  options: readonly ChoiceOption<T>[];
  /** The chosen one; null while none is (a new automation's trigger). */
  value: T | null;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Stretch across the width, each segment as wide as the others. */
  fill?: boolean;
  /** Let a label take two lines where the row is narrow (a phone), rather than cut it short. */
  wrap?: boolean;
  className?: string;
  "aria-labelledby"?: string;
}) {
  const group = useRadioGroup(options, value, onChange, "horizontal");
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn(
        "flex max-w-full rounded-[10px] bg-surface-2 p-[3px] ring-1 ring-line ring-inset",
        fill ? "w-full" : "w-fit overflow-x-auto [scrollbar-width:none]",
        className,
      )}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            ref={group.ref(index)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={option.disabled}
            tabIndex={index === group.stop ? 0 : -1}
            onClick={() => !on && onChange(option.value)}
            onKeyDown={group.onKeyDown(index)}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] font-medium transition-[color,background-color,box-shadow] outline-none",
              "focus-visible:shadow-[0_0_0_2px_var(--accent)] disabled:opacity-50",
              wrap ? "py-1 text-center leading-tight max-sm:flex-col max-sm:gap-0.5" : "whitespace-nowrap",
              size === "sm" ? (wrap ? "min-h-7 px-2 text-[12.5px]" : "h-7 px-2.5 text-[12.5px]") : wrap ? "min-h-8 px-2 text-[13px]" : "h-8 px-3 text-[13px]",
              fill && "flex-1",
              on ? "bg-surface text-fg shadow-[var(--shadow-raised)]" : "text-nav hover:text-fg",
            )}
          >
            {option.icon && (
              <span aria-hidden className={cn("grid shrink-0 place-items-center", on ? "text-fg" : "text-muted")}>
                {option.icon}
              </span>
            )}
            <span className={wrap ? "min-w-0" : "truncate"}>{option.label}</span>
            {option.count !== undefined && <span className="text-[12px] font-normal text-muted tabular-nums">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A card for each choice, one under another (or side by side with `columns`), with what it means. */
export function RadioCards<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = false,
  className,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Side by side where there is room. */
  columns?: boolean;
  className?: string;
}) {
  const group = useRadioGroup(options, value, onChange, "both");
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(columns ? "grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2" : "flex flex-col gap-2", className)}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            ref={group.ref(index)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={option.disabled}
            tabIndex={index === group.stop ? 0 : -1}
            onClick={() => !on && onChange(option.value)}
            onKeyDown={group.onKeyDown(index)}
            className={cn(
              "flex items-start gap-3 rounded-xl border bg-surface p-3 text-left transition-[border-color,box-shadow] outline-none",
              "focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-50",
              on ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-line hover:border-line-strong",
            )}
          >
            {option.icon && (
              <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", on ? "bg-accent-soft text-accent-dark" : "bg-surface-2 text-nav")}>
                {option.icon}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] leading-snug font-semibold [overflow-wrap:anywhere]">{option.label}</span>
              {option.description && <span className="text-[12.5px] leading-snug text-fg-2">{option.description}</span>}
            </span>
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors",
                on ? "border-accent bg-accent text-white" : "border-line-strong bg-surface",
              )}
            >
              {on && <CheckIcon size={11} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
