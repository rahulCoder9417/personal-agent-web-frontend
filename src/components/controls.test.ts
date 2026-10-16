// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ListItem } from "@/lib/listbox";
import { DatePicker } from "./date-picker";
import { MultiSelect } from "./multi-select";
import { NumberStepper } from "./number-stepper";
import { RadioCards, SegmentedControl } from "./segmented-control";
import { TimePicker } from "./time-picker";
import { SwitchRow } from "./ui";

// The app's own controls on the Automations page, used in a browser-like page with the keyboard
// and the pointer: what they say, what a key does, and the value they hand back.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

/** Draws a control that keeps its own value, and the list of values it handed back. */
function mount<T>(render: (value: T, set: (next: T) => void) => ReturnType<typeof createElement>, start: T) {
  const seen: T[] = [];
  function Harness() {
    const [value, setValue] = useState(start);
    return render(value, (next) => {
      seen.push(next);
      setValue(next);
    });
  }
  act(() => root.render(createElement(Harness)));
  return seen;
}

function key(target: Element, name: string, extra: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...extra }));
  });
}
function click(target: Element) {
  act(() => (target as HTMLElement).click());
}
function type(input: HTMLInputElement, text: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const radios = () => [...document.querySelectorAll('[role="radio"]')] as HTMLButtonElement[];

describe("SegmentedControl", () => {
  const options = [
    { value: "once", label: "Once" },
    { value: "schedule", label: "On a schedule" },
    { value: "event", label: "On an app event", disabled: false },
  ] as const;

  it("is a radio group where only the chosen one is reached with Tab", () => {
    mount<string>((value, set) => createElement(SegmentedControl<string>, { label: "When it runs", options, value, onChange: set }), "schedule");
    expect(document.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("When it runs");
    expect(radios().map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("with nothing chosen, Tab lands on the first", () => {
    mount<string | null>((value, set) => createElement(SegmentedControl<string>, { label: "When", options, value, onChange: set }), null);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
  });

  it("the arrows move the focus and the choice, going round; Home and End go to the ends", () => {
    const seen = mount<string>((value, set) => createElement(SegmentedControl<string>, { label: "When", options, value, onChange: set }), "once");
    radios()[0].focus();
    key(radios()[0], "ArrowRight");
    expect(seen).toEqual(["schedule"]);
    expect(document.activeElement).toBe(radios()[1]);
    key(radios()[1], "ArrowLeft");
    key(radios()[0], "ArrowLeft");
    expect(seen).toEqual(["schedule", "once", "event"]);
    key(radios()[2], "Home");
    expect(seen.at(-1)).toBe("once");
    key(radios()[0], "End");
    expect(seen.at(-1)).toBe("event");
  });

  it("a click chooses; the one already chosen changes nothing", () => {
    const seen = mount<string>((value, set) => createElement(SegmentedControl<string>, { label: "When", options, value, onChange: set }), "once");
    click(radios()[0]);
    expect(seen).toEqual([]);
    click(radios()[2]);
    expect(seen).toEqual(["event"]);
  });
});

describe("RadioCards", () => {
  it("are radio cards with what each means, moved through with the arrows", () => {
    const seen = mount<string>(
      (value, set) =>
        createElement(RadioCards<string>, {
          label: "When Tex asks you first",
          value,
          onChange: set,
          options: [
            { value: "risky", label: "Sending waits", description: "The platform’s rule" },
            { value: "changes", label: "Anything that changes", description: "Stricter" },
          ],
        }),
      "risky",
    );
    expect(document.body.textContent).toContain("The platform’s rule");
    radios()[0].focus();
    key(radios()[0], "ArrowDown");
    expect(seen).toEqual(["changes"]);
    expect(radios()[1].getAttribute("aria-checked")).toBe("true");
  });
});

describe("TimePicker", () => {
  const input = () => document.querySelector('input[role="combobox"]') as HTMLInputElement;

  it("shows the time as people read it", () => {
    mount<string>((value, set) => createElement(TimePicker, { id: "t", value, onChange: set }), "08:00");
    expect(input().value).toBe("8:00 AM");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on the chosen time; the arrows move and Enter chooses", () => {
    const seen = mount<string>((value, set) => createElement(TimePicker, { id: "t", value, onChange: set }), "08:00");
    key(input(), "ArrowDown");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    const active = () => document.getElementById(input().getAttribute("aria-activedescendant")!);
    expect(active()?.textContent).toContain("8:00 AM");
    key(input(), "ArrowDown");
    expect(active()?.textContent).toContain("8:15 AM");
    key(input(), "Enter");
    expect(seen).toEqual(["08:15"]);
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().value).toBe("8:15 AM");
  });

  it("takes any time typed, with Enter or by leaving the field", () => {
    const seen = mount<string>((value, set) => createElement(TimePicker, { id: "t", value, onChange: set }), "08:00");
    act(() => input().focus());
    type(input(), "7:10pm");
    expect(document.body.textContent).toContain("7:10 PM");
    key(input(), "Enter");
    expect(seen).toEqual(["19:10"]);
    type(input(), "930");
    act(() => input().blur());
    expect(seen).toEqual(["19:10", "09:30"]);
  });

  it("Escape puts back what was there", () => {
    const seen = mount<string>((value, set) => createElement(TimePicker, { id: "t", value, onChange: set }), "08:00");
    type(input(), "11pm");
    key(input(), "Escape");
    expect(seen).toEqual([]);
    expect(input().value).toBe("8:00 AM");
  });
});

describe("DatePicker", () => {
  const button = () => document.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
  const focused = () => document.activeElement as HTMLElement;

  it("shows the day, and opens a month with the keys on the chosen day", () => {
    mount<string>((value, set) => createElement(DatePicker, { id: "d", value, onChange: set, today: "2026-10-16", min: "2026-10-16" }), "2026-10-20");
    expect(button().textContent).toContain("Tue 20 Oct 2026");
    click(button());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("October 2026");
    expect(focused().getAttribute("data-day")).toBe("2026-10-20");
    expect(document.querySelector('[data-day="2026-10-16"]')?.getAttribute("aria-label")).toBe("Friday 16 October 2026, today");
  });

  it("the arrows move a day or a week, Page Down a month, and Enter chooses", () => {
    const seen = mount<string>((value, set) => createElement(DatePicker, { id: "d", value, onChange: set, today: "2026-10-16" }), "2026-10-20");
    click(button());
    key(focused(), "ArrowRight");
    expect(focused().getAttribute("data-day")).toBe("2026-10-21");
    key(focused(), "ArrowDown");
    expect(focused().getAttribute("data-day")).toBe("2026-10-28");
    key(focused(), "PageDown");
    expect(document.body.textContent).toContain("November 2026");
    expect(focused().getAttribute("data-day")).toBe("2026-11-28");
    key(focused(), "Enter");
    expect(seen).toEqual(["2026-11-28"]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("days before the first allowed can't be picked; Escape closes without a change", () => {
    const seen = mount<string>((value, set) => createElement(DatePicker, { id: "d", value, onChange: set, today: "2026-10-16", min: "2026-10-16" }), "2026-10-16");
    click(button());
    key(focused(), "ArrowLeft");
    expect(focused().getAttribute("data-day")).toBe("2026-10-16");
    click(document.querySelector('[data-day="2026-10-15"]')!);
    expect(seen).toEqual([]);
    key(focused(), "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(seen).toEqual([]);
  });

  it("Tomorrow picks the next day", () => {
    const seen = mount<string>((value, set) => createElement(DatePicker, { id: "d", value, onChange: set, today: "2026-10-16" }), "2026-10-20");
    click(button());
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Tomorrow")!);
    expect(seen).toEqual(["2026-10-17"]);
  });
});

describe("MultiSelect", () => {
  const APPS: ListItem[] = [
    { value: "gmail", label: "Gmail" },
    { value: "github", label: "GitHub" },
    { value: "slack", label: "Slack" },
    { label: "Not connected", options: [{ value: "linear", label: "Linear", disabled: true, hint: "Connect first" }] },
  ];
  const input = () => document.querySelector('input[role="combobox"]') as HTMLInputElement;
  const chips = () => [...document.querySelectorAll("[data-chip-remove]")].map((b) => b.getAttribute("aria-label"));

  it("shows each chosen one as a chip with its own Remove", () => {
    mount<string[]>((values, set) => createElement(MultiSelect, { id: "m", label: "Apps", values, options: APPS, onChange: set }), ["gmail"]);
    expect(chips()).toEqual(["Remove Gmail from Apps"]);
  });

  it("Enter ticks and unticks while the list stays open; it says it takes several", () => {
    const seen = mount<string[]>((values, set) => createElement(MultiSelect, { id: "m", label: "Apps", values, options: APPS, onChange: set }), []);
    key(input(), "ArrowDown");
    expect(document.querySelector('[role="listbox"]')?.getAttribute("aria-multiselectable")).toBe("true");
    key(input(), "Enter");
    key(input(), "ArrowDown");
    key(input(), "Enter");
    expect(seen.at(-1)).toEqual(["gmail", "github"]);
    expect(input().getAttribute("aria-expanded")).toBe("true");
    key(input(), "ArrowUp");
    key(input(), "Enter");
    expect(seen.at(-1)).toEqual(["github"]);
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1);
  });

  it("typing finds an app; one that can't be picked is shown but skipped", () => {
    const seen = mount<string[]>((values, set) => createElement(MultiSelect, { id: "m", label: "Apps", values, options: APPS, onChange: set }), []);
    type(input(), "sla");
    key(input(), "Enter");
    expect(seen.at(-1)).toEqual(["slack"]);
    type(input(), "lin");
    expect(document.body.textContent).toContain("Connect first");
    key(input(), "Enter");
    expect(seen).toHaveLength(1);
  });

  it("Backspace in the empty search takes off the last chip, and × takes off its own", () => {
    const seen = mount<string[]>((values, set) => createElement(MultiSelect, { id: "m", label: "Apps", values, options: APPS, onChange: set }), ["gmail", "github", "slack"]);
    key(input(), "Backspace");
    expect(seen.at(-1)).toEqual(["gmail", "github"]);
    click(document.querySelector('[aria-label="Remove Gmail from Apps"]')!);
    expect(seen.at(-1)).toEqual(["github"]);
  });
});

describe("NumberStepper", () => {
  const spin = () => document.querySelector('[role="spinbutton"]') as HTMLElement;
  const format = (n: number) => (n === 1 ? "Every hour" : `Every ${n} hours`);

  it("says its value in words, and the arrows, Home and End change it within its range", () => {
    const seen = mount<number>((value, set) => createElement(NumberStepper, { value, onChange: set, min: 1, max: 23, label: "Every how many hours", format }), 4);
    expect(spin().getAttribute("aria-valuetext")).toBe("Every 4 hours");
    key(spin(), "ArrowUp");
    key(spin(), "ArrowDown");
    key(spin(), "ArrowDown");
    expect(seen).toEqual([5, 4, 3]);
    key(spin(), "End");
    expect(seen.at(-1)).toBe(23);
    key(spin(), "ArrowUp");
    expect(seen.at(-1)).toBe(23);
    key(spin(), "Home");
    expect(spin().textContent).toBe("Every hour");
  });

  it("digits typed one after another make a number", () => {
    const seen = mount<number>((value, set) => createElement(NumberStepper, { value, onChange: set, min: 1, max: 23, format }), 4);
    key(spin(), "1");
    key(spin(), "2");
    expect(seen).toEqual([1, 12]);
    key(spin(), "9");
    expect(seen.at(-1)).toBe(9);
  });

  it("− and + change it with the pointer", () => {
    const seen = mount<number>((value, set) => createElement(NumberStepper, { value, onChange: set, min: 1, max: 23, format }), 1);
    const [minus, plus] = [...document.querySelectorAll("button")] as HTMLButtonElement[];
    expect(minus.disabled).toBe(true);
    click(plus);
    expect(seen).toEqual([2]);
  });
});

describe("SwitchRow", () => {
  it("is one switch for the whole row; locked, it stays as it is", () => {
    const seen = mount<boolean>((on, set) => createElement(SwitchRow, { on, onToggle: () => set(!on), title: "Also a copy to Telegram", description: "To your linked chat" }), false);
    const row = document.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(row.getAttribute("aria-checked")).toBe("false");
    click(row);
    expect(seen).toEqual([true]);
    expect(row.getAttribute("aria-checked")).toBe("true");
    act(() => root.render(createElement(SwitchRow, { on: true, locked: true, onToggle: () => seen.push(false), title: "Your Automations chat" })));
    click(document.querySelector('[role="switch"]')!);
    expect(seen).toEqual([true]);
    expect(document.querySelector('[role="switch"]')?.getAttribute("aria-disabled")).toBe("true");
  });
});
