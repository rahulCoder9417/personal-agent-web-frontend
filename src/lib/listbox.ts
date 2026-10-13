// The rules of the app's dropdowns, before anything draws them: which option a key moves to, what
// typing picks out, which options a search leaves, and whether the list opens under the field or
// above it. `Select` and `Combobox` (src/components/select.tsx) draw them.

/** One choice in a dropdown. */
export type ListOption = {
  value: string;
  label: string;
  /** A second line under the label, for what the choice means. */
  description?: string;
  /** A short note at the end of the row: an offset, "Recommended", "Needs Max". */
  hint?: string;
  /** Shown, but can't be picked. */
  disabled?: boolean;
  /** More words a search finds the option by, besides its label, value and hint. */
  keywords?: readonly string[];
};

/** Options under a heading of their own. */
export type ListGroup = { label: string; options: readonly ListOption[] };

/** What a dropdown is given: options, groups of options, or both, in the order they are shown. */
export type ListItem = ListOption | ListGroup;

export function isGroup(item: ListItem): item is ListGroup {
  return "options" in item;
}

/** Every option in the order it is shown, with the groups opened up. Keys move through this list. */
export function flatOptions(items: readonly ListItem[]): ListOption[] {
  return items.flatMap((item) => (isGroup(item) ? item.options : [item]));
}

export function indexOfValue(options: readonly ListOption[], value: string | null | undefined): number {
  return value == null ? -1 : options.findIndex((option) => option.value === value);
}

export function firstEnabled(options: readonly ListOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

export function lastEnabled(options: readonly ListOption[]): number {
  return options.findLastIndex((option) => !option.disabled);
}

/** The option the list opens on: the one chosen, else the first that can be picked. */
export function openingIndex(options: readonly ListOption[], value: string | null | undefined): number {
  const at = indexOfValue(options, value);
  return at >= 0 && !options[at].disabled ? at : firstEnabled(options);
}

/**
 * The option `by` places away from `from` (1 and -1 for the arrows, 10 for a page), skipping the
 * ones that can't be picked. It stops at the ends instead of going round. With nothing active yet,
 * down goes to the first option and up to the last.
 */
export function step(options: readonly ListOption[], from: number, by: number): number {
  if (by === 0 || options.length === 0) return from;
  if (from < 0 || from >= options.length) return by > 0 ? firstEnabled(options) : lastEnabled(options);
  const dir = Math.sign(by);
  const target = Math.min(Math.max(from + by, 0), options.length - 1);
  // On a disabled option: go on in the same direction, then come back towards where it started.
  for (let i = target; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
  for (let i = target - dir; i !== from && i >= 0 && i < options.length; i -= dir) if (!options[i].disabled) return i;
  return from;
}

/** Lower case, without accents: "Zürich" is found by "zurich". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Type-ahead: the option that letters typed in quick succession lead to, or -1. It is the next one
 * after `from` whose label starts with them, so pressing one letter again and again goes through
 * every option that starts with it, and a longer word keeps the option it already fits.
 */
export function typeAhead(options: readonly ListOption[], typed: string, from: number): number {
  const text = fold(typed);
  if (!text) return -1;
  const repeated = [...text].every((char) => char === text[0]);
  const query = repeated ? text[0] : text;
  const start = Math.max(repeated ? from + 1 : from, 0);
  for (let k = 0; k < options.length; k++) {
    const i = (start + k) % options.length;
    if (!options[i].disabled && fold(options[i].label).startsWith(query)) return i;
  }
  return -1;
}

/** Everything a search looks through for one option. */
function haystack(option: ListOption): string {
  return fold([option.label, option.value, option.hint ?? "", ...(option.keywords ?? [])].join(" "));
}

/** The words of an option's text: "America/New_York" has "america", "new" and "york". */
function wordsOf(text: string): string[] {
  return text.split(/[\s/_\-(),.]+/).filter(Boolean);
}

/**
 * What a search leaves: the options that contain every word typed, anywhere in their label, value,
 * hint or keywords. Those with a word that starts with what was typed come first; otherwise the order
 * is kept. A group stays only while something in it is left.
 */
export function filterItems(items: readonly ListItem[], query: string): ListItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  const first = wordsOf(words[0])[0] ?? words[0];

  const keep = (options: readonly ListOption[]) => {
    const hits = options.filter((option) => {
      const text = haystack(option);
      return words.every((word) => text.includes(word));
    });
    const starts = (option: ListOption) => wordsOf(haystack(option)).some((word) => word.startsWith(first));
    return [...hits.filter(starts), ...hits.filter((option) => !starts(option))];
  };

  const out: ListItem[] = [];
  const loose: ListOption[] = [];
  const flushLoose = () => {
    if (loose.length) out.push(...keep(loose));
    loose.length = 0;
  };
  for (const item of items) {
    if (isGroup(item)) {
      flushLoose();
      const options = keep(item.options);
      if (options.length) out.push({ ...item, options });
    } else {
      loose.push(item);
    }
  }
  flushLoose();
  return out;
}

// ---------------------------------------------------------------- keys

/** The parts of a key press the rules look at. */
export type KeyPress = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

/** What a key does. The component carries it out and calls `preventDefault` when `prevent` says so. */
export type ListAction =
  | { kind: "open"; active: number }
  | { kind: "move"; active: number }
  /** Choose the option at `index` and close. */
  | { kind: "pick"; index: number }
  /** Close and keep what was chosen before. */
  | { kind: "close" }
  /** A letter for type-ahead (the Select): opens the list if it isn't, then finds the option. */
  | { kind: "type"; char: string }
  | { kind: "none" };

export type KeyResult = { action: ListAction; prevent: boolean };

const PAGE = 10;
const NONE: KeyResult = { action: { kind: "none" }, prevent: false };

/** A key that types a character, as opposed to Shift, Tab, an arrow or a shortcut. */
export function isPrintable(press: KeyPress): boolean {
  return press.key.length === 1 && !press.ctrlKey && !press.metaKey && !press.altKey;
}

type ListState = {
  open: boolean;
  /** The option the keys are on while the list is open, or -1. */
  active: number;
  /** The option that is chosen now, or -1. */
  selected: number;
};

/**
 * A key on a Select: a button that opens a list (the "select-only combobox" of WAI-ARIA). The
 * arrows, Enter and Space open it on the chosen option, Home and End on the first and last, and a
 * letter on the option it starts. Open, the arrows, Home, End and the page keys move, Enter or
 * Space chooses, Escape closes and Tab closes as focus moves on; neither of the last two changes
 * the choice. `typing` is whether type-ahead letters are still being collected, when Space is part
 * of the word rather than a choice.
 */
export function selectKey(press: KeyPress, options: readonly ListOption[], state: ListState & { typing?: boolean }): KeyResult {
  const { key } = press;
  const opening = state.selected >= 0 && !options[state.selected]?.disabled ? state.selected : firstEnabled(options);

  if (!state.open) {
    switch (key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        return { action: { kind: "open", active: opening }, prevent: true };
      case "Home":
        return { action: { kind: "open", active: firstEnabled(options) }, prevent: true };
      case "End":
        return { action: { kind: "open", active: lastEnabled(options) }, prevent: true };
      default:
        return isPrintable(press) ? { action: { kind: "type", char: key }, prevent: true } : NONE;
    }
  }

  const pick = (): KeyResult =>
    state.active >= 0 && !options[state.active]?.disabled
      ? { action: { kind: "pick", index: state.active }, prevent: true }
      : { action: { kind: "close" }, prevent: true };

  switch (key) {
    case "ArrowDown":
      return { action: { kind: "move", active: step(options, state.active, 1) }, prevent: true };
    case "ArrowUp":
      return press.altKey ? pick() : { action: { kind: "move", active: step(options, state.active, -1) }, prevent: true };
    case "PageDown":
      return { action: { kind: "move", active: step(options, state.active, PAGE) }, prevent: true };
    case "PageUp":
      return { action: { kind: "move", active: step(options, state.active, -PAGE) }, prevent: true };
    case "Home":
      return { action: { kind: "move", active: firstEnabled(options) }, prevent: true };
    case "End":
      return { action: { kind: "move", active: lastEnabled(options) }, prevent: true };
    case "Enter":
      return pick();
    case " ":
      return state.typing ? { action: { kind: "type", char: " " }, prevent: true } : pick();
    case "Escape":
      return { action: { kind: "close" }, prevent: true };
    case "Tab":
      // Focus moves on as it would anyway; the list just closes behind it.
      return { action: { kind: "close" }, prevent: false };
    default:
      return isPrintable(press) ? { action: { kind: "type", char: key }, prevent: true } : NONE;
  }
}

/**
 * A key in a Combobox: a field that is typed in to filter the list (`options` is what the search
 * left). Typing itself is not a key here: the field's text changes and the list opens on the first
 * option that fits. The arrows open the list and move in it; Enter chooses; Escape and Tab close
 * and put the field back to what was chosen. Home and End stay with the text, as in any field.
 */
export function comboboxKey(press: KeyPress, options: readonly ListOption[], state: ListState): KeyResult {
  const { key } = press;
  if (!state.open) {
    if (key === "ArrowDown" || key === "ArrowUp") {
      const at = state.selected >= 0 && !options[state.selected]?.disabled ? state.selected : key === "ArrowUp" ? lastEnabled(options) : firstEnabled(options);
      return { action: { kind: "open", active: press.altKey ? state.selected : at }, prevent: true };
    }
    return NONE;
  }

  switch (key) {
    case "ArrowDown":
      return { action: { kind: "move", active: step(options, state.active, 1) }, prevent: true };
    case "ArrowUp":
      if (press.altKey) {
        return state.active >= 0 && !options[state.active]?.disabled
          ? { action: { kind: "pick", index: state.active }, prevent: true }
          : { action: { kind: "close" }, prevent: true };
      }
      return { action: { kind: "move", active: step(options, state.active, -1) }, prevent: true };
    case "PageDown":
      return { action: { kind: "move", active: step(options, state.active, PAGE) }, prevent: true };
    case "PageUp":
      return { action: { kind: "move", active: step(options, state.active, -PAGE) }, prevent: true };
    case "Enter":
      // Never the form's Enter while the list is open: it chooses, or just closes.
      return state.active >= 0 && !options[state.active]?.disabled
        ? { action: { kind: "pick", index: state.active }, prevent: true }
        : { action: { kind: "close" }, prevent: true };
    case "Escape":
      return { action: { kind: "close" }, prevent: true };
    case "Tab":
      return { action: { kind: "close" }, prevent: false };
    default:
      return NONE;
  }
}

// ---------------------------------------------------------------- where the list goes

export type Rect = { top: number; bottom: number; left: number; width: number };

export type Placement = {
  /** The list opens above the field. */
  up: boolean;
  left: number;
  width: number;
  maxHeight: number;
};

const GAP = 4;
const MARGIN = 8;

/** How far the list sits from the field. */
export const LIST_GAP = GAP;

/**
 * Where the list of options goes: under the field, or above it when there isn't room for it below
 * and there is more above (a field near the bottom of the window). It is as wide as the field, at
 * least `minWidth`, and never runs off the side of the window. `view.height` is where the visible
 * part of the window ends (above a phone's keyboard, when it is up).
 */
export function placeList(anchor: Rect, view: { width: number; height: number }, want: number, minWidth = 0): Placement {
  const below = view.height - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  const up = below < Math.min(want, 220) && above > below;
  const width = Math.min(Math.max(anchor.width, minWidth), view.width - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(anchor.left, view.width - width - MARGIN));
  return { up, left, width, maxHeight: Math.max(Math.min(want, up ? above : below), 0) };
}
