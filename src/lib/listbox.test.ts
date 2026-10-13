import { describe, expect, it } from "vitest";
import {
  comboboxKey,
  filterItems,
  firstEnabled,
  flatOptions,
  fold,
  lastEnabled,
  openingIndex,
  placeList,
  selectKey,
  step,
  typeAhead,
  type ListItem,
  type ListOption,
} from "./listbox";

const opt = (label: string, extra: Partial<ListOption> = {}): ListOption => ({ value: label.toLowerCase(), label, ...extra });

// Default, then two groups, with a choice that can't be picked in the middle.
const MODELS: ListItem[] = [
  opt("Default"),
  { label: "Opus", options: [opt("Opus 5.5", { description: "Most capable" }), opt("Opus 5", { disabled: true, hint: "Needs Max" })] },
  { label: "Sonnet", options: [opt("Sonnet 5.5"), opt("Sonnet 5")] },
];
const FLAT = flatOptions(MODELS);
const labels = (items: readonly ListItem[]) => flatOptions(items).map((option) => option.label);

describe("the options", () => {
  it("opens the groups up, in the order they are shown", () => {
    expect(labels(MODELS)).toEqual(["Default", "Opus 5.5", "Opus 5", "Sonnet 5.5", "Sonnet 5"]);
  });

  it("finds the first and last options that can be picked", () => {
    const options = [opt("A", { disabled: true }), opt("B"), opt("C"), opt("D", { disabled: true })];
    expect(firstEnabled(options)).toBe(1);
    expect(lastEnabled(options)).toBe(2);
    expect(firstEnabled([opt("A", { disabled: true })])).toBe(-1);
  });

  it("opens on the chosen option, or the first that can be picked", () => {
    expect(openingIndex(FLAT, "sonnet 5.5")).toBe(3);
    expect(openingIndex(FLAT, null)).toBe(0);
    expect(openingIndex(FLAT, "not offered")).toBe(0);
    // A chosen option that can't be picked any more isn't where the keys start.
    expect(openingIndex(FLAT, "opus 5")).toBe(0);
  });
});

describe("step", () => {
  it("moves one option at a time and stops at the ends", () => {
    expect(step(FLAT, 0, 1)).toBe(1);
    expect(step(FLAT, 4, 1)).toBe(4);
    expect(step(FLAT, 0, -1)).toBe(0);
  });

  it("skips options that can't be picked", () => {
    expect(step(FLAT, 1, 1)).toBe(3);
    expect(step(FLAT, 3, -1)).toBe(1);
  });

  it("stays put when only disabled options are left that way", () => {
    const options = [opt("A"), opt("B"), opt("C", { disabled: true })];
    expect(step(options, 1, 1)).toBe(1);
  });

  it("jumps a page, landing on the nearest option that can be picked", () => {
    const many = Array.from({ length: 30 }, (_, i) => opt(`Zone ${i}`, { disabled: i === 10 }));
    expect(step(many, 0, 10)).toBe(11);
    expect(step(many, 25, 10)).toBe(29);
    expect(step(many, 5, -10)).toBe(0);
  });

  it("starts from the first or the last when nothing is active yet", () => {
    expect(step(FLAT, -1, 1)).toBe(0);
    expect(step(FLAT, -1, -1)).toBe(4);
  });
});

describe("typeAhead", () => {
  const zones = ["Africa/Cairo", "America/New York", "Asia/Kolkata", "Asia/Tokyo", "Europe/London", "Europe/Zürich"].map((label) => opt(label));

  it("goes to the next option that starts with the letters typed", () => {
    expect(typeAhead(zones, "e", 0)).toBe(4);
    expect(typeAhead(zones, "asia/t", 0)).toBe(3);
  });

  it("goes through the options that start with one letter, pressed again and again", () => {
    expect(typeAhead(zones, "a", 0)).toBe(1);
    expect(typeAhead(zones, "aa", 1)).toBe(2);
    expect(typeAhead(zones, "aaa", 3)).toBe(0);
  });

  it("keeps the option a longer word still fits", () => {
    expect(typeAhead(zones, "asia", 2)).toBe(2);
  });

  it("ignores case and accents, and skips options that can't be picked", () => {
    expect(typeAhead(zones, "EUROPE/Z", 0)).toBe(5);
    expect(typeAhead(zones, "europe/zu", 0)).toBe(5);
    expect(typeAhead(FLAT, "opus 5", 0)).toBe(1);
    expect(typeAhead(FLAT, "opus 5 ", 1)).toBe(-1);
  });

  it("finds nothing when nothing starts with it", () => {
    expect(typeAhead(zones, "x", 0)).toBe(-1);
    expect(typeAhead(zones, "", 0)).toBe(-1);
  });
});

describe("filterItems", () => {
  const zones: ListItem[] = [
    opt("America/New York", { value: "America/New_York", hint: "GMT-4" }),
    opt("Asia/Kolkata", { value: "Asia/Kolkata", hint: "GMT+5:30" }),
    opt("Europe/London", { value: "Europe/London", hint: "GMT+1" }),
    opt("Pacific/Port Moresby", { value: "Pacific/Port_Moresby", hint: "GMT+10" }),
    opt("America/Barbados", { value: "America/Barbados", hint: "GMT-4", keywords: ["Bridgetown"] }),
  ];

  it("keeps everything for an empty search", () => {
    expect(filterItems(zones, "  ")).toEqual(zones);
  });

  it("finds a city by part of its name, in any case", () => {
    expect(labels(filterItems(zones, "kolk"))).toEqual(["Asia/Kolkata"]);
    expect(labels(filterItems(zones, "LONDON"))).toEqual(["Europe/London"]);
  });

  it("needs every word typed, in any order", () => {
    expect(labels(filterItems(zones, "york new"))).toEqual(["America/New York"]);
    expect(labels(filterItems(zones, "new_york"))).toEqual(["America/New York"]);
  });

  it("finds by the hint and by keywords", () => {
    expect(labels(filterItems(zones, "5:30"))).toEqual(["Asia/Kolkata"]);
    expect(labels(filterItems(zones, "gmt-4"))).toEqual(["America/New York", "America/Barbados"]);
    expect(labels(filterItems(zones, "bridgetown"))).toEqual(["America/Barbados"]);
  });

  it("puts the options with a word that starts with the search first", () => {
    // "an" is inside "Amman", but starts "Antarctica".
    expect(labels(filterItems([opt("Asia/Amman"), opt("Antarctica/Casey")], "an"))).toEqual(["Antarctica/Casey", "Asia/Amman"]);
  });

  it("keeps a group only while something in it is left", () => {
    const left = filterItems(MODELS, "sonnet");
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ label: "Sonnet" });
    expect(labels(left)).toEqual(["Sonnet 5.5", "Sonnet 5"]);
    expect(filterItems(MODELS, "nothing like this")).toEqual([]);
  });

  it("keeps options that can't be picked, to show them", () => {
    expect(labels(filterItems(MODELS, "opus"))).toEqual(["Opus 5.5", "Opus 5"]);
  });

  it("folds accents", () => {
    expect(fold("Zürich")).toBe("zurich");
    expect(labels(filterItems([opt("Europe/Zürich")], "zurich"))).toEqual(["Europe/Zürich"]);
  });
});

describe("selectKey: closed", () => {
  const closed = { open: false, active: -1, selected: 3 };

  it("opens on the chosen option with the arrows, Enter and Space", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Enter", " "]) {
      expect(selectKey({ key }, FLAT, closed)).toEqual({ action: { kind: "open", active: 3 }, prevent: true });
    }
  });

  it("opens on the first option when nothing is chosen", () => {
    expect(selectKey({ key: "ArrowDown" }, FLAT, { ...closed, selected: -1 }).action).toEqual({ kind: "open", active: 0 });
  });

  it("opens on the first or the last option with Home and End", () => {
    expect(selectKey({ key: "Home" }, FLAT, closed).action).toEqual({ kind: "open", active: 0 });
    expect(selectKey({ key: "End" }, FLAT, closed).action).toEqual({ kind: "open", active: 4 });
  });

  it("starts type-ahead with a letter", () => {
    expect(selectKey({ key: "s" }, FLAT, closed)).toEqual({ action: { kind: "type", char: "s" }, prevent: true });
  });

  it("leaves Tab, Escape and shortcuts to the browser", () => {
    expect(selectKey({ key: "Tab" }, FLAT, closed)).toEqual({ action: { kind: "none" }, prevent: false });
    expect(selectKey({ key: "Escape" }, FLAT, closed).prevent).toBe(false);
    expect(selectKey({ key: "r", metaKey: true }, FLAT, closed).prevent).toBe(false);
  });
});

describe("selectKey: open", () => {
  const open = { open: true, active: 1, selected: 0 };

  it("moves with the arrows, skipping what can't be picked", () => {
    expect(selectKey({ key: "ArrowDown" }, FLAT, open).action).toEqual({ kind: "move", active: 3 });
    expect(selectKey({ key: "ArrowUp" }, FLAT, open).action).toEqual({ kind: "move", active: 0 });
  });

  it("goes to the first and last with Home and End, and a page with Page Up and Down", () => {
    expect(selectKey({ key: "Home" }, FLAT, { ...open, active: 4 }).action).toEqual({ kind: "move", active: 0 });
    expect(selectKey({ key: "End" }, FLAT, open).action).toEqual({ kind: "move", active: 4 });
    expect(selectKey({ key: "PageDown" }, FLAT, open).action).toEqual({ kind: "move", active: 4 });
    expect(selectKey({ key: "PageUp" }, FLAT, open).action).toEqual({ kind: "move", active: 0 });
  });

  it("chooses the active option with Enter, Space and Alt+Up", () => {
    expect(selectKey({ key: "Enter" }, FLAT, open)).toEqual({ action: { kind: "pick", index: 1 }, prevent: true });
    expect(selectKey({ key: " " }, FLAT, open).action).toEqual({ kind: "pick", index: 1 });
    expect(selectKey({ key: "ArrowUp", altKey: true }, FLAT, open).action).toEqual({ kind: "pick", index: 1 });
  });

  it("never chooses an option that can't be picked", () => {
    expect(selectKey({ key: "Enter" }, FLAT, { ...open, active: 2 }).action).toEqual({ kind: "close" });
  });

  it("takes Space as part of a word while type-ahead letters are coming", () => {
    expect(selectKey({ key: " " }, FLAT, { ...open, typing: true }).action).toEqual({ kind: "type", char: " " });
  });

  it("closes with Escape, keeping the choice", () => {
    expect(selectKey({ key: "Escape" }, FLAT, open)).toEqual({ action: { kind: "close" }, prevent: true });
  });

  it("closes with Tab and lets focus move on", () => {
    expect(selectKey({ key: "Tab" }, FLAT, open)).toEqual({ action: { kind: "close" }, prevent: false });
  });
});

describe("comboboxKey", () => {
  const closed = { open: false, active: -1, selected: 1 };
  const open = { open: true, active: 0, selected: 1 };

  it("opens with the arrows, on the chosen option", () => {
    expect(comboboxKey({ key: "ArrowDown" }, FLAT, closed)).toEqual({ action: { kind: "open", active: 1 }, prevent: true });
    expect(comboboxKey({ key: "ArrowUp" }, FLAT, { ...closed, selected: -1 }).action).toEqual({ kind: "open", active: 4 });
  });

  it("leaves every other key to the field while closed: Enter submits the form, letters type", () => {
    for (const key of ["Enter", "a", " ", "Home", "Escape", "Tab"]) {
      expect(comboboxKey({ key }, FLAT, closed)).toEqual({ action: { kind: "none" }, prevent: false });
    }
  });

  it("moves with the arrows and the page keys, but leaves Home and End to the text", () => {
    expect(comboboxKey({ key: "ArrowDown" }, FLAT, open).action).toEqual({ kind: "move", active: 1 });
    expect(comboboxKey({ key: "ArrowDown" }, FLAT, { ...open, active: 1 }).action).toEqual({ kind: "move", active: 3 });
    expect(comboboxKey({ key: "PageDown" }, FLAT, open).action).toEqual({ kind: "move", active: 4 });
    expect(comboboxKey({ key: "Home" }, FLAT, open).action).toEqual({ kind: "none" });
  });

  it("chooses with Enter and never submits the form while open", () => {
    expect(comboboxKey({ key: "Enter" }, FLAT, open)).toEqual({ action: { kind: "pick", index: 0 }, prevent: true });
    expect(comboboxKey({ key: "Enter" }, [], { ...open, active: -1 })).toEqual({ action: { kind: "close" }, prevent: true });
    expect(comboboxKey({ key: "Enter" }, FLAT, { ...open, active: 2 }).action).toEqual({ kind: "close" });
  });

  it("closes with Escape and Tab", () => {
    expect(comboboxKey({ key: "Escape" }, FLAT, open)).toEqual({ action: { kind: "close" }, prevent: true });
    expect(comboboxKey({ key: "Tab" }, FLAT, open)).toEqual({ action: { kind: "close" }, prevent: false });
  });
});

describe("placeList", () => {
  const view = { width: 1280, height: 800 };

  it("opens under the field when there is room", () => {
    const place = placeList({ top: 100, bottom: 136, left: 400, width: 260 }, view, 320);
    expect(place).toEqual({ up: false, left: 400, width: 260, maxHeight: 320 });
  });

  it("opens upward near the bottom of the window", () => {
    const place = placeList({ top: 700, bottom: 736, left: 400, width: 260 }, view, 320);
    expect(place.up).toBe(true);
    expect(place.maxHeight).toBe(320);
  });

  it("stays under the field when a short list fits there", () => {
    expect(placeList({ top: 600, bottom: 636, left: 0, width: 200 }, view, 120).up).toBe(false);
  });

  it("is shorter than it wants when neither side has the room", () => {
    const place = placeList({ top: 300, bottom: 336, left: 0, width: 200 }, { width: 400, height: 500 }, 600);
    expect(place.up).toBe(true);
    expect(place.maxHeight).toBe(300 - 4 - 8);
  });

  it("is at least as wide as asked and never runs off the side", () => {
    const place = placeList({ top: 100, bottom: 136, left: 1100, width: 120 }, view, 200, 280);
    expect(place.width).toBe(280);
    expect(place.left).toBe(1280 - 280 - 8);
    expect(placeList({ top: 100, bottom: 136, left: 8, width: 380 }, { width: 390, height: 800 }, 200, 600).width).toBe(390 - 16);
  });
});
