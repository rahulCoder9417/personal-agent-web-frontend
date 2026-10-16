"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/format";
import { MinusIcon, PlusIcon } from "./icons";

/** The number a key gives in a stepper, or null for a key it leaves alone. */
export function stepperKey(key: string, value: number, min: number, max: number, typed = ""): { value: number; typed: string } | null {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return { value: clamp(value + 1), typed: "" };
    case "ArrowDown":
    case "ArrowLeft":
      return { value: clamp(value - 1), typed: "" };
    case "PageUp":
      return { value: clamp(value + 5), typed: "" };
    case "PageDown":
      return { value: clamp(value - 5), typed: "" };
    case "Home":
      return { value: min, typed: "" };
    case "End":
      return { value: max, typed: "" };
    default: {
      if (!/^\d$/.test(key)) return null;
      // Digits typed one after another make a number ("1", "2" → 12); one that would go past the
      // end starts again from the last digit.
      const joined = Number(typed + key);
      return joined <= max ? { value: clamp(joined), typed: typed + key } : { value: clamp(Number(key)), typed: key };
    }
  }
}

/**
 * A whole number with − and + on either side, in place of the browser's number field: "Every 4
 * hours". It is one `spinbutton` for the keyboard (the arrows, Page Up and Down, Home and End, or
 * digits typed); the buttons are for the pointer. `format` says the value in words, for the field
 * and for a screen reader.
 */
export function NumberStepper({
  id,
  value,
  onChange,
  min,
  max,
  label,
  format = String,
  disabled,
  className,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label?: string;
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const typed = useRef({ text: "", at: 0 });
  const set = (next: number) => {
    if (next !== value) onChange(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const fresh = Date.now() - typed.current.at < 900 ? typed.current.text : "";
    const result = stepperKey(event.key, value, min, max, fresh);
    if (!result) return;
    event.preventDefault();
    typed.current = { text: result.typed, at: Date.now() };
    set(result.value);
  };
  const button = "grid size-[30px] shrink-0 place-items-center rounded-[7px] text-nav transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className={cn("flex h-9 w-fit items-center gap-0.5 rounded-[9px] border border-line-strong bg-surface p-[2px]", disabled && "bg-surface-2", className)}>
      <button type="button" tabIndex={-1} aria-hidden className={button} disabled={disabled || value <= min} onClick={() => set(Math.max(min, value - 1))}>
        <MinusIcon size={14} />
      </button>
      <div
        id={id}
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={describedBy}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={format(value)}
        aria-disabled={disabled || undefined}
        onKeyDown={disabled ? undefined : onKeyDown}
        className="min-w-[96px] rounded-md px-2 text-center text-[13.5px] font-medium tabular-nums outline-none focus-visible:shadow-[0_0_0_2px_var(--accent)]"
      >
        {format(value)}
      </div>
      <button type="button" tabIndex={-1} aria-hidden className={button} disabled={disabled || value >= max} onClick={() => set(Math.min(max, value + 1))}>
        <PlusIcon size={14} />
      </button>
    </div>
  );
}
