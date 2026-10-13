"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  comboboxKey,
  filterItems,
  firstEnabled,
  flatOptions,
  indexOfValue,
  isGroup,
  LIST_GAP,
  openingIndex,
  placeList,
  selectKey,
  typeAhead,
  type KeyResult,
  type ListGroup,
  type ListItem,
  type ListOption,
  type Placement,
} from "@/lib/listbox";
import { useMediaQuery } from "@/lib/media-query";
import { cn } from "@/lib/format";
import { CheckIcon, ChevronRightIcon } from "./icons";

// The app's dropdowns: `Select` (a button that opens a list) and `Combobox` (a field that is typed
// in to find an option, for long lists such as time zones). The rules of the keys, the search and
// where the list goes are in src/lib/listbox.ts; this file draws them.

export type { ListGroup, ListItem, ListOption } from "@/lib/listbox";

/** Below this width a Select opens as a sheet from the bottom of the screen, with big rows. */
const SHEET_BELOW = "(max-width: 639px)";
/** How tall the list may be, at most. */
const LIST_HEIGHT = 320;
/** Letters typed within this long are one type-ahead word. */
const TYPE_AHEAD_MS = 600;

/** The look of the closed control: a field, like `inputClass`, with the open state of a focused one. */
const FIELD =
  "flex h-9 w-full min-w-0 items-center gap-2 rounded-[9px] border border-line-strong bg-surface px-3 text-left text-[13.5px] transition-shadow outline-none";
const FIELD_FOCUS = "border-accent shadow-[0_0_0_3px_var(--accent-soft)]";
const FIELD_FOCUS_VISIBLE = "focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]";
const FIELD_FOCUS_WITHIN = "focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]";
const FIELD_DISABLED = "bg-surface-2 text-muted";

function Chevron({ open }: { open: boolean }) {
  return <ChevronRightIcon size={14} className={cn("shrink-0 text-muted transition-transform", open ? "-rotate-90" : "rotate-90")} />;
}

// ---------------------------------------------------------------- the list

/**
 * The options, drawn: a listbox with groups under their headings, a check by the one chosen, a
 * second line and a note where an option has them, and the disabled ones faded. The keys stay on
 * the field (`aria-activedescendant`), so nothing in here takes focus.
 */
export function OptionList({
  id,
  items,
  value,
  active,
  label,
  roomy = false,
  onActive,
  onPick,
}: {
  id: string;
  items: readonly ListItem[];
  value: string | null;
  /** The option the keys are on, counted through the groups. */
  active: number;
  /** What a screen reader calls the list. */
  label?: string;
  /** Big rows, for fingers (the sheet on a phone). */
  roomy?: boolean;
  onActive?: (index: number) => void;
  onPick?: (index: number) => void;
}) {
  const option = (choice: ListOption, at: number) => {
    const chosen = choice.value === value;
    return (
      <div
        key={`${choice.value}-${at}`}
        id={optionId(id, at)}
        role="option"
        aria-selected={chosen}
        aria-disabled={choice.disabled || undefined}
        // On a pointer that moves, not one that is merely there, so a list that scrolls under a
        // still mouse doesn't take the keys away.
        onPointerMove={() => {
          if (!choice.disabled && at !== active) onActive?.(at);
        }}
        onClick={() => {
          if (!choice.disabled) onPick?.(at);
        }}
        className={cn(
          "flex items-start gap-2.5 rounded-lg px-2.5 transition-colors",
          roomy ? "min-h-12 py-3 text-[15px]" : "min-h-8 py-[7px] text-[13.5px]",
          choice.disabled ? "cursor-default opacity-50" : "cursor-pointer",
          at === active && !choice.disabled && "bg-surface-2",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("leading-snug", chosen && "font-medium")}>{choice.label}</span>
          {choice.description && <span className={cn("leading-snug text-muted", roomy ? "text-[13px]" : "text-[12.5px]")}>{choice.description}</span>}
        </span>
        {choice.hint && <span className={cn("shrink-0 text-[12px] text-muted tabular-nums", roomy ? "pt-0.5" : "pt-px")}>{choice.hint}</span>}
        <CheckIcon size={roomy ? 16 : 14} className={cn("mt-[3px] shrink-0 text-accent", !chosen && "invisible")} />
      </div>
    );
  };

  return (
    <div id={id} role="listbox" aria-label={label} className="flex flex-col">
      {numbered(items).map((row, g) =>
        "group" in row ? (
          <div key={`group-${g}`} role="group" aria-labelledby={`${id}-group-${g}`} className="flex flex-col [&+&]:mt-1 [&+&]:border-t [&+&]:border-line [&+&]:pt-1">
            <div
              id={`${id}-group-${g}`}
              role="presentation"
              className={cn("px-2.5 pt-2 pb-1 font-semibold tracking-[0.02em] text-muted uppercase", roomy ? "text-[12px]" : "text-[11px]")}
            >
              {row.group.label}
            </div>
            {row.options.map(({ option: choice, at }) => option(choice, at))}
          </div>
        ) : (
          option(row.option, row.at)
        ),
      )}
    </div>
  );
}

type Numbered = { option: ListOption; at: number };

/** The items with each option's place in the flat list, the one the keys count through. */
function numbered(items: readonly ListItem[]): (Numbered | { group: ListGroup; options: Numbered[] })[] {
  let at = 0;
  return items.map((item) =>
    isGroup(item) ? { group: item, options: item.options.map((option) => ({ option, at: at++ })) } : { option: item, at: at++ },
  );
}

function optionId(listId: string, index: number) {
  return `${listId}-option-${index}`;
}

/** Scrolls the list just enough to show the active option, or puts it in the middle as the list opens. */
function reveal(scroller: HTMLElement | null, listId: string, index: number, middle: boolean): boolean {
  if (!scroller) return false;
  const row = index >= 0 ? document.getElementById(optionId(listId, index)) : null;
  if (!row) return true;
  const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const bottom = top + row.offsetHeight;
  if (middle) scroller.scrollTop = top - scroller.clientHeight / 2 + row.offsetHeight / 2;
  else if (top < scroller.scrollTop) scroller.scrollTop = top - 4;
  else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight + 4;
  return true;
}

// ---------------------------------------------------------------- the popover

/** Where the visible part of the window ends: above a phone's keyboard when it is up. */
function visibleView() {
  const vv = window.visualViewport;
  return { width: window.innerWidth, height: vv ? Math.min(window.innerHeight, vv.offsetTop + vv.height) : window.innerHeight };
}

/**
 * Keeps the open list next to its field: placed as it opens, and again as the page scrolls or the
 * window changes size. It closes on a press anywhere but the field and the list.
 */
type Spot = Placement & { top?: number; bottom?: number };

function usePopover(open: boolean, anchor: RefObject<HTMLElement | null>, popover: RefObject<HTMLElement | null>, close: () => void, minWidth: number) {
  const [place, setPlace] = useState<Spot | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const placement = placeList(box, visibleView(), LIST_HEIGHT, minWidth);
      // Fixed to the window: from its bottom edge when the list opens upward, else from its top.
      setPlace(placement.up ? { ...placement, bottom: window.innerHeight - box.top + LIST_GAP } : { ...placement, top: box.bottom + LIST_GAP });
    };
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", later);
    window.visualViewport?.addEventListener("resize", later);
    // Capture: the page scrolls inside panes, not the window. The list's own scrolling is ignored.
    const onScroll = (event: Event) => {
      if (!popover.current?.contains(event.target as Node)) later();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", later);
      window.visualViewport?.removeEventListener("resize", later);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, anchor, popover, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (anchor.current?.contains(target) || popover.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, anchor, popover, close]);

  return open ? place : null;
}

/** The floating panel the list sits in, beside its field. */
function Floating({
  place,
  popRef,
  scrollRef,
  children,
}: {
  place: Spot;
  popRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return createPortal(
    <div
      ref={popRef}
      // Pressing in the list must not take focus from the field: the keys stay there.
      onMouseDown={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        left: place.left,
        width: place.width,
        maxHeight: place.maxHeight,
        top: place.top,
        bottom: place.bottom,
      }}
      className={cn(
        "z-50 flex flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-pop)] ring-1 ring-line-strong",
        place.up ? "dropdown-up" : "dropdown-down",
      )}
    >
      <div ref={scrollRef} className="scroll-pane min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** On a phone: the list as a sheet from the bottom of the screen, over a dimmed page. */
function Sheet({
  title,
  popRef,
  scrollRef,
  onClose,
  children,
}: {
  title?: string;
  popRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <div ref={popRef} onMouseDown={(event) => event.preventDefault()} className="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden onClick={onClose} className="sheet-backdrop absolute inset-0 bg-[rgb(21_21_21/0.32)]" />
      <div className="sheet-up relative flex max-h-[min(72dvh,560px)] flex-col rounded-t-[18px] bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-[var(--shadow-pop)]">
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
        {title && <p className="shrink-0 px-5 pt-3 pb-1.5 text-[15px] font-semibold">{title}</p>}
        <div ref={scrollRef} className="scroll-pane min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-3">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Select

type SelectProps = {
  /** For a `<label htmlFor>` (`Field`), which names the control. */
  id?: string;
  /** The chosen option's value. An empty string is an option like any other ("Default"). */
  value: string | null;
  options: readonly ListItem[];
  /** Called with a new choice only: picking the option already chosen just closes the list. */
  onChange: (value: string) => void;
  /** What the control says when nothing is chosen. */
  placeholder?: string;
  /** The field's name: the title of the sheet on a phone, and the list's name for a screen reader. */
  label?: string;
  disabled?: boolean;
  /** At least this wide when open, for options with a second line. */
  minListWidth?: number;
  className?: string;
  "aria-describedby"?: string;
};

/**
 * A dropdown in the app's own look: a button showing the choice, and a list of options under it
 * (above it near the bottom of the window, and a sheet from the bottom of the screen on a phone).
 * The keys follow WAI-ARIA's "select-only combobox": see `selectKey`.
 */
export function Select({ id, value, options, onChange, placeholder = "Choose…", label, disabled, minListWidth = 0, className, ...rest }: SelectProps) {
  const ownId = useId();
  const listId = `${id ?? ownId}-list`;
  const flat = useMemo(() => flatOptions(options), [options]);
  const selected = indexOfValue(flat, value);
  const chosen = selected >= 0 ? flat[selected] : null;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const sheet = useMediaQuery(SHEET_BELOW);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", timer: 0 });
  const opened = useRef(false);

  const close = useCallback(() => setOpen(false), []);
  const place = usePopover(open && !sheet, trigger, pop, close, minListWidth);

  const openAt = (index: number) => {
    opened.current = true;
    setActive(index);
    setOpen(true);
  };

  const pick = (index: number) => {
    const option = flat[index];
    setOpen(false);
    trigger.current?.focus();
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  };

  const type = (char: string) => {
    window.clearTimeout(typed.current.timer);
    typed.current.text += char;
    typed.current.timer = window.setTimeout(() => (typed.current.text = ""), TYPE_AHEAD_MS);
    const from = open ? active : selected;
    const hit = typeAhead(flat, typed.current.text, from);
    if (!open) openAt(hit >= 0 ? hit : openingIndex(flat, value));
    else if (hit >= 0) setActive(hit);
  };

  useEffect(() => () => window.clearTimeout(typed.current.timer), []);

  // Keep the active option in sight: in the middle as the list opens, at the edge as keys move.
  useLayoutEffect(() => {
    if (!open) return;
    // The list is drawn a moment after it opens, once it has been placed.
    if (reveal(scroller.current, listId, active, opened.current)) opened.current = false;
  }, [open, active, listId, place, sheet]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const result: KeyResult = selectKey(event, flat, { open, active, selected, typing: typed.current.text.length > 0 });
    if (result.prevent) event.preventDefault();
    const { action } = result;
    if (action.kind === "open") openAt(action.active);
    else if (action.kind === "move") setActive(action.active);
    else if (action.kind === "pick") pick(action.index);
    else if (action.kind === "type") type(action.char);
    else if (action.kind === "close") {
      // Escape closes this list, not a drawer or dialog it sits in.
      if (event.key === "Escape") event.stopPropagation();
      setOpen(false);
    }
  };

  const list = (
    <OptionList id={listId} items={options} value={value} active={active} label={label} roomy={sheet} onActive={setActive} onPick={pick} />
  );

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
        aria-label={id ? undefined : label}
        aria-describedby={rest["aria-describedby"]}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt(openingIndex(flat, value)))}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!pop.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
        className={cn(FIELD, FIELD_FOCUS_VISIBLE, open && FIELD_FOCUS, disabled && FIELD_DISABLED, className)}
      >
        <span className={cn("min-w-0 flex-1 truncate", !chosen && "text-muted")}>{chosen ? chosen.label : value || placeholder}</span>
        {chosen?.hint && <span className="shrink-0 text-[12px] text-muted tabular-nums">{chosen.hint}</span>}
        <Chevron open={open} />
      </button>
      {open && sheet && (
        <Sheet title={label} popRef={pop} scrollRef={scroller} onClose={close}>
          {list}
        </Sheet>
      )}
      {place && (
        <Floating place={place} popRef={pop} scrollRef={scroller}>
          {list}
        </Floating>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Combobox

type ComboboxProps = Omit<SelectProps, "placeholder"> & {
  /** What the field says when it is empty. */
  placeholder?: string;
  /** What the list says when a search finds nothing. */
  emptyText?: (query: string) => ReactNode;
};

/**
 * A dropdown that is typed in to find an option, for long lists (every time zone). Typing filters
 * the list and puts the keys on the first option left, so a few letters and Enter is a choice.
 * Escape, Tab or leaving the field puts back what was chosen. See `comboboxKey`.
 */
export function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder = "Search…",
  label,
  disabled,
  minListWidth = 0,
  emptyText = (query) => `Nothing matches “${query}”`,
  className,
  ...rest
}: ComboboxProps) {
  const ownId = useId();
  const listId = `${id ?? ownId}-list`;
  const all = useMemo(() => flatOptions(options), [options]);
  const chosen = all[indexOfValue(all, value)] ?? null;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // On a phone the list stays under the field (a sheet would sit under the keyboard), with big rows.
  const narrow = useMediaQuery(SHEET_BELOW);
  // What is typed; null while the field shows the choice.
  const [query, setQuery] = useState<string | null>(null);
  const items = useMemo(() => (query === null ? options : filterItems(options, query)), [options, query]);
  const flat = useMemo(() => flatOptions(items), [items]);
  const selected = indexOfValue(flat, value);

  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    setQuery(null);
  }, []);
  const place = usePopover(open, field, pop, close, minListWidth);

  const openAt = (index: number) => {
    opened.current = true;
    setActive(index);
    setOpen(true);
  };

  const pick = (index: number) => {
    const option = flat[index];
    close();
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  };

  useLayoutEffect(() => {
    if (!open) return;
    if (reveal(scroller.current, listId, active, opened.current)) opened.current = false;
  }, [open, active, listId, place]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const result = comboboxKey(event, flat, { open, active, selected });
    if (result.prevent) event.preventDefault();
    const { action } = result;
    if (action.kind === "open") openAt(action.active);
    else if (action.kind === "move") setActive(action.active);
    else if (action.kind === "pick") pick(action.index);
    else if (action.kind === "close") {
      if (event.key === "Escape") event.stopPropagation();
      close();
    }
  };

  return (
    <>
      <div
        ref={field}
        className={cn(FIELD, "cursor-text pr-1.5", open ? FIELD_FOCUS : FIELD_FOCUS_WITHIN, disabled && FIELD_DISABLED, className)}
        onMouseDown={(event) => {
          // A press in the text is the field's own (it opens the list on click). One on the padding or
          // the chevron opens or closes the list, and leaves the focus in the field.
          if (disabled || event.button !== 0 || event.target === input.current) return;
          event.preventDefault();
          if (open) {
            close();
            return;
          }
          input.current?.focus();
          openAt(openingIndex(flat, value));
        }}
      >
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
          aria-label={id ? undefined : label}
          aria-describedby={rest["aria-describedby"]}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={chosen ? chosen.label : placeholder}
          value={query ?? chosen?.label ?? value ?? ""}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => {
            if (open) return;
            // The whole text is selected, so what is typed next replaces it.
            event.currentTarget.select();
            openAt(openingIndex(flat, value));
          }}
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
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/80 disabled:text-muted"
        />
        {query === null && chosen?.hint && <span className="pointer-events-none shrink-0 text-[12px] text-muted tabular-nums">{chosen.hint}</span>}
        <span aria-hidden className="grid size-6 shrink-0 place-items-center">
          <Chevron open={open} />
        </span>
      </div>
      {place && (
        <Floating place={place} popRef={pop} scrollRef={scroller}>
          {flat.length === 0 ? (
            <p role="status" className="px-2.5 py-2 text-[13px] text-muted">
              {emptyText(query ?? "")}
            </p>
          ) : (
            <OptionList id={listId} items={items} value={value} active={active} label={label} roomy={narrow} onActive={setActive} onPick={pick} />
          )}
        </Floating>
      )}
    </>
  );
}
