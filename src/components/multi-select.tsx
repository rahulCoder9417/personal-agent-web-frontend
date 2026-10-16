"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { comboboxKey, filterItems, firstEnabled, flatOptions, toggleValue, type ListItem } from "@/lib/listbox";
import { useMediaQuery } from "@/lib/media-query";
import { CloseIcon } from "./icons";
import { Chevron, FIELD_DISABLED, FIELD_FOCUS, FIELD_FOCUS_WITHIN, Floating, OptionList, optionId, reveal, SHEET_BELOW, usePopover } from "./select";

/**
 * Several choices out of a list, shown as chips in the field (an app's logo and name, with × to
 * take it off), and a search to find more: the apps an automation may use. Typing filters the list;
 * the arrows move in it; Enter or a click ticks or unticks an option and the list stays open for the
 * next one. Backspace in the empty search takes off the last chip; Escape closes the list. The
 * search is a `combobox` over a `listbox` that says it takes several (`aria-multiselectable`).
 */
export function MultiSelect({
  id,
  values,
  options,
  onChange,
  label,
  placeholder = "Search…",
  emptyText = (query) => `Nothing matches “${query}”`,
  minListWidth = 0,
  disabled,
  className,
  "aria-describedby": describedBy,
}: {
  id?: string;
  /** The chosen values, in the order they were chosen. */
  values: readonly string[];
  options: readonly ListItem[];
  onChange: (values: string[]) => void;
  /** The field's name, for a screen reader and the chips' Remove buttons. */
  label: string;
  placeholder?: string;
  emptyText?: (query: string) => ReactNode;
  minListWidth?: number;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const ownId = useId();
  const listId = `${id ?? ownId}-list`;
  const all = useMemo(() => flatOptions(options), [options]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState("");
  const narrow = useMediaQuery(SHEET_BELOW);
  const items = useMemo(() => (query ? filterItems(options, query) : options), [options, query]);
  const flat = useMemo(() => flatOptions(items), [items]);

  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  const place = usePopover(open, field, pop, close, minListWidth);

  const openAt = (index: number) => {
    opened.current = true;
    setActive(index);
    setOpen(true);
  };
  const toggle = (index: number) => {
    const option = flat[index];
    if (!option || option.disabled) return;
    onChange(toggleValue(values, option.value));
  };

  useLayoutEffect(() => {
    if (!open) return;
    if (reveal(scroller.current, listId, active, opened.current)) opened.current = false;
  }, [open, active, listId, place]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && query === "" && values.length > 0) {
      event.preventDefault();
      onChange(values.slice(0, -1));
      return;
    }
    const result = comboboxKey(event, flat, { open, active, selected: -1 });
    if (result.prevent) event.preventDefault();
    const { action } = result;
    if (action.kind === "open") openAt(action.active < 0 ? firstEnabled(flat) : action.active);
    else if (action.kind === "move") setActive(action.active);
    else if (action.kind === "pick") toggle(action.index);
    else if (action.kind === "close") {
      if (event.key === "Escape") event.stopPropagation();
      close();
    }
  };

  const chips = values.map((value) => all.find((option) => option.value === value) ?? { value, label: value });

  return (
    <>
      <div
        ref={field}
        className={cn(
          "flex min-h-9 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-[9px] border border-line-strong bg-surface py-[5px] pr-1.5 pl-1.5 text-[13.5px] transition-shadow",
          "cursor-text",
          open ? FIELD_FOCUS : FIELD_FOCUS_WITHIN,
          disabled && FIELD_DISABLED,
          className,
        )}
        onMouseDown={(event) => {
          if (disabled || event.button !== 0 || event.target === input.current) return;
          if ((event.target as HTMLElement).closest("[data-chip-remove]")) return;
          event.preventDefault();
          input.current?.focus();
          if (open) close();
          else openAt(firstEnabled(flat));
        }}
      >
        {chips.map((chip) => (
          <span key={chip.value} className="inline-flex h-[26px] max-w-full min-w-0 items-center gap-1.5 rounded-md bg-surface-2 pr-0.5 pl-1.5 text-[12.5px] font-medium ring-1 ring-line ring-inset">
            {chip.icon && (
              <span aria-hidden className="grid size-4 shrink-0 place-items-center">
                {chip.icon}
              </span>
            )}
            <span className="truncate">{chip.label}</span>
            <button
              type="button"
              data-chip-remove
              aria-label={`Remove ${chip.label} from ${label}`}
              disabled={disabled}
              onClick={() => {
                onChange(values.filter((value) => value !== chip.value));
                input.current?.focus();
              }}
              className="grid size-5 place-items-center rounded text-muted transition-colors hover:bg-line hover:text-fg"
            >
              <CloseIcon size={12} />
            </button>
          </span>
        ))}
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
          disabled={disabled}
          value={query}
          placeholder={values.length ? "Add more…" : placeholder}
          onClick={() => !open && openAt(firstEnabled(flat))}
          onChange={(event) => {
            const text = event.target.value;
            setQuery(text);
            opened.current = true;
            setActive(firstEnabled(flatOptions(filterItems(options, text))));
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!pop.current?.contains(event.relatedTarget as Node | null)) close();
          }}
          className="h-[26px] min-w-[96px] flex-1 bg-transparent px-1 outline-none placeholder:text-muted/80 disabled:text-muted"
        />
        <span aria-hidden className="grid size-6 shrink-0 place-items-center self-start">
          <Chevron open={open} />
        </span>
      </div>
      {place && (
        <Floating place={place} popRef={pop} scrollRef={scroller}>
          {flat.length === 0 ? (
            <p role="status" className="px-2.5 py-2 text-[13px] text-muted">
              {emptyText(query)}
            </p>
          ) : (
            <OptionList id={listId} items={items} value={null} values={values} active={active} label={label} roomy={narrow} onActive={setActive} onPick={toggle} />
          )}
        </Floating>
      )}
    </>
  );
}
