import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ListItem } from "@/lib/listbox";
import { Combobox, OptionList, Select } from "./select";

// What the dropdowns draw. How the keys, typing and the search behave is in src/lib/listbox.test.ts.

const MODELS: ListItem[] = [
  { value: "", label: "Default" },
  {
    label: "Opus",
    options: [
      { value: "claude-opus-5-5", label: "Opus 5.5", description: "Most capable" },
      { value: "claude-opus-5", label: "Opus 5", disabled: true, hint: "Needs Max" },
    ],
  },
  { label: "Sonnet", options: [{ value: "claude-sonnet-5-5", label: "Sonnet 5.5" }] },
];

const noop = () => {};
const draw = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("Select, closed", () => {
  it("is a button that says what is chosen and that it opens a list", () => {
    const html = draw(createElement(Select, { id: "model", value: "claude-opus-5-5", options: MODELS, onChange: noop }));
    expect(html).toContain('<button id="model" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false"');
    expect(html).toContain("Opus 5.5");
    // No list is drawn until it opens, so nothing points at one.
    expect(html).not.toContain("aria-controls");
    expect(html).not.toContain('role="listbox"');
  });

  it("shows “Default” when that is the choice, and the placeholder when nothing is", () => {
    expect(draw(createElement(Select, { id: "m", value: "", options: MODELS, onChange: noop }))).toContain(">Default<");
    expect(draw(createElement(Select, { id: "m", value: null, options: [{ value: "a", label: "A" }], onChange: noop, placeholder: "Pick one" }))).toContain(
      ">Pick one<",
    );
  });

  it("shows the chosen option's note beside it", () => {
    const html = draw(createElement(Select, { id: "tz", value: "Asia/Kolkata", options: [{ value: "Asia/Kolkata", label: "Asia/Kolkata", hint: "GMT+5:30" }], onChange: noop }));
    expect(html).toContain("GMT+5:30");
  });

  it("is named by its label when no <label> points at it, and can be disabled", () => {
    const html = draw(createElement(Select, { value: "", options: MODELS, onChange: noop, label: "Model", disabled: true }));
    expect(html).toContain('aria-label="Model"');
    expect(html).toContain("disabled");
  });
});

describe("Combobox, closed", () => {
  it("is a field that searches a list, showing the choice and its note", () => {
    const zones = [
      { value: "Asia/Kolkata", label: "Asia/Kolkata", hint: "GMT+5:30" },
      { value: "Europe/London", label: "Europe/London", hint: "GMT+1" },
    ];
    const html = draw(createElement(Combobox, { id: "tz", value: "Asia/Kolkata", options: zones, onChange: noop }));
    expect(html).toContain('id="tz" role="combobox" aria-autocomplete="list" aria-expanded="false"');
    expect(html).toContain('value="Asia/Kolkata"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain("GMT+5:30");
    expect(html).not.toContain("Europe/London");
  });
});

describe("OptionList", () => {
  const html = draw(createElement(OptionList, { id: "list", items: MODELS, value: "claude-opus-5-5", active: 3, label: "Model" }));

  it("is a named listbox of options, counted through the groups", () => {
    expect(html).toContain('id="list" role="listbox" aria-label="Model"');
    for (const [i, label] of ["Default", "Opus 5.5", "Opus 5", "Sonnet 5.5"].entries()) {
      expect(html).toMatch(new RegExp(`id="list-option-${i}" role="option"[^>]*>.*?${label.replace(".", "\\.")}<`));
    }
  });

  it("marks the chosen option, and only that one", () => {
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/id="list-option-1" role="option" aria-selected="true"/);
  });

  it("marks an option that can't be picked", () => {
    expect(html).toMatch(/id="list-option-2" role="option" aria-selected="false" aria-disabled="true"/);
    expect(html.match(/aria-disabled/g)).toHaveLength(1);
  });

  it("puts groups under their headings", () => {
    expect(html).toContain('role="group" aria-labelledby="list-group-1"');
    expect(html).toMatch(/id="list-group-1" role="presentation"[^>]*>Opus</);
    expect(html).toMatch(/id="list-group-2" role="presentation"[^>]*>Sonnet</);
  });

  it("draws an option's second line and its note", () => {
    expect(html).toContain("Most capable");
    expect(html).toContain("Needs Max");
  });

  it("highlights the option the keys are on", () => {
    expect(html).toMatch(/id="list-option-3" role="option" aria-selected="false" class="[^"]*bg-surface-2/);
    expect(html).not.toMatch(/id="list-option-0" role="option" aria-selected="false" class="[^"]*bg-surface-2/);
  });
});
