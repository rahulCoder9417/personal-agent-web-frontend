// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The canvas in a page: a click, Enter or Space on any box opens its settings (React Flow turns
// pointer events off on its nodes, so each box turns them back on); a condition and its Stop open
// their step's settings; the "+" on a line offers the places a step can go; the × removes a step
// without opening it; an empty lane's "Add a … step" and "Skip reading" do what they say.

import LaneCanvas, { type LaneCanvasProps } from "@/components/automations/lane-canvas";
import { laneDiagram } from "@/lib/automation-lanes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  host.style.width = "800px";
  host.style.height = "900px";
  document.body.append(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function show(over: Partial<LaneCanvasProps> = {}) {
  const diagram = laneDiagram([{ id: "r" }, { id: "t" }], ["read", "tex"]);
  const props: LaneCanvasProps = {
    diagram,
    boxes: new Map([
      ["trigger", { key: "trigger", logo: "schedule", label: "Schedule", title: "Every day at 9:00 AM" }],
      ["step:r", { key: "step:r", logo: "gmail", label: "Step 1 · Gmail", title: "Fetch emails", removable: true }],
      ["step:t", { key: "step:t", logo: "tex", label: "Step 2 · Tex", title: "Sum them up" }],
    ]),
    empties: new Map([["empty:write", { key: "empty:write", lane: "write", title: "Writing skipped", line: "Tex only tells you.", action: "Add a write step" }]]),
    results: { title: "Automations chat", line: "Where each run answers" },
    heads: diagram.heads.map((head) => ({ before: head.before, text: head.lane, ...(head.skip ? { skip: "Skip reading" } : {}) })),
    conditions: new Map([["step:t", { text: "Only if the step before found something", title: "Only if: found something", line: "Otherwise the run stops here", warn: false }]]),
    selected: "trigger",
    count: 2,
    editing: true,
    compact: false,
    dragging: null,
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onSkip: vi.fn(),
    onPlus: vi.fn(),
    onDrop: vi.fn(),
    onDropTrigger: vi.fn(),
    label: "Morning email, step by step",
    ...over,
  };
  root = createRoot(host);
  act(() => root.render(createElement(LaneCanvas, props)));
  return props;
}

const box = (label: string) => {
  const found = host.querySelector<HTMLElement>(`[aria-label^="${label}"]`);
  if (!found) throw new Error(`No box "${label}"`);
  return found;
};

describe("the canvas, clicked", () => {
  it("opens the settings of every kind of box on a click", () => {
    const props = show();
    const boxes: [string, string][] = [
      ["Schedule: Every day", "trigger"],
      ["Step 1 · Gmail", "step:r"],
      ["Step 2 · Tex", "step:t"],
      ["Results: Automations chat", "results"],
      // The condition and its Stop are the step's "only if": they open the step.
      ["Only if the step before", "step:t"],
      ["Stop:", "step:t"],
    ];
    for (const [label, key] of boxes) {
      act(() => box(label).click());
      expect(props.onSelect).toHaveBeenLastCalledWith(key);
    }
    expect(props.onSelect).toHaveBeenCalledTimes(boxes.length);
  });

  it("opens them with Enter and Space too", () => {
    const props = show();
    act(() => void box("Step 1 · Gmail").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(props.onSelect).toHaveBeenLastCalledWith("step:r");
    act(() => void box("Results: Automations chat").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(props.onSelect).toHaveBeenLastCalledWith("results");
  });

  it("removes a step with its × without opening it", () => {
    const props = show();
    act(() => host.querySelector<HTMLElement>('[aria-label="Remove Fetch emails"]')!.click());
    expect(props.onRemove).toHaveBeenCalledWith("step:r");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("offers the places a step can go from a line's +, an empty lane's button, and skips a lane", () => {
    const props = show();
    const pluses = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Add a step here"]')];
    expect(pluses.length).toBeGreaterThan(0);
    act(() => pluses[0].click());
    expect(props.onPlus).toHaveBeenCalledTimes(1);
    expect((props.onPlus as ReturnType<typeof vi.fn>).mock.calls[0][0].length).toBeGreaterThan(0);
    act(() => [...host.querySelectorAll("button")].find((button) => button.textContent === "Add a write step")!.click());
    expect(props.onPlus).toHaveBeenCalledTimes(2);
    expect((props.onPlus as ReturnType<typeof vi.fn>).mock.calls[1][0]).toEqual([expect.objectContaining({ lane: "write" })]);
    act(() => [...host.querySelectorAll("button")].find((button) => button.textContent === "Skip reading")!.click());
    expect(props.onSkip).toHaveBeenCalledWith("read");
  });

  it("at 6 steps its + says so and adds nothing", () => {
    const props = show({ count: 6 });
    const full = host.querySelector<HTMLButtonElement>('[aria-label="Up to 6 steps"]');
    expect(full?.disabled).toBe(true);
    expect(props.onPlus).not.toHaveBeenCalled();
  });
});
