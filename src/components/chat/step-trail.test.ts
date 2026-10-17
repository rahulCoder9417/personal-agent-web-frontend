// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The trail of a turn's steps in the chat: "+N earlier steps" opens the earlier ones and "Hide
// earlier steps" folds them again, whatever arrives on the live stream meanwhile; the same step done
// many times in a row is one line with a count.

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import type { ProgressLine } from "@/lib/crew";
import type { DraftStep } from "@/lib/drafts";
import { StepTrail } from "./thread";

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
});

const did = (text: string, progress: ProgressLine[] = []): DraftStep => ({ text, progress, action: true });
const scout = (text: string): ProgressLine => ({ who: "scout", name: "Scout", text, at: "2026-10-17T10:00:00.000Z" });
const steps = (n: number) => Array.from({ length: n }, (_, index) => did(`Step ${index + 1}`));

const draw = (props: { steps: readonly DraftStep[]; live?: boolean }) => act(() => root.render(createElement(StepTrail, props)));
const toggle = () => host.querySelector("button");
const lines = () => [...host.querySelectorAll("li")].map((li) => li.textContent);
const click = () => act(() => toggle()!.click());

describe("the step trail", () => {
  it("opens the earlier steps, and shuts them again", () => {
    draw({ steps: steps(6) });
    expect(lines()).toEqual(["Step 4", "Step 5", "Step 6"]);
    expect(toggle()?.textContent).toBe("+3 earlier steps");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    // It names the list it opens.
    expect(host.querySelector(`#${CSS.escape(toggle()!.getAttribute("aria-controls")!)}`)?.tagName).toBe("OL");

    click();
    expect(lines()).toEqual(["Step 1", "Step 2", "Step 3", "Step 4", "Step 5", "Step 6"]);
    expect(toggle()?.textContent).toBe("Hide earlier steps");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");

    click();
    expect(lines()).toEqual(["Step 4", "Step 5", "Step 6"]);
    expect(toggle()?.textContent).toBe("+3 earlier steps");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the person's choice while new steps stream in", () => {
    draw({ steps: steps(5), live: true });
    click();
    click();
    // Shut again, then a step arrives: it stays shut, with one more step folded.
    draw({ steps: steps(6), live: true });
    expect(lines()).toEqual(["Step 4", "Step 5", "Step 6"]);
    expect(toggle()?.textContent).toBe("+3 earlier steps");

    // Opened, then steps arrive: it stays open, and the way to shut it stays there.
    click();
    draw({ steps: steps(8), live: true });
    expect(lines()).toHaveLength(8);
    expect(toggle()?.textContent).toBe("Hide earlier steps");
    click();
    expect(lines()).toEqual(["Step 6", "Step 7", "Step 8"]);
  });

  it("keeps its way to shut in view while open (pinned to the top of the thread as it scrolls)", () => {
    draw({ steps: steps(6) });
    const holder = () => toggle()!.parentElement!.className.split(" ");
    expect(holder()).not.toContain("sticky");
    click();
    expect(holder()).toEqual(expect.arrayContaining(["sticky", "top-0", "bg-surface"]));
  });

  it("folds the same step done many times in a row into one line with a count", () => {
    const handed = { text: "The integration doesn't have a list action, so I'll have Scout look them up.", progress: [scout("List open PRs")] };
    draw({ steps: [did("Looked at your apps"), did("Looked at your apps"), handed, ...Array.from({ length: 16 }, () => did("Read a web page"))], live: true });
    expect(lines()).toEqual([
      "Looked at your apps×2",
      "The integration doesn't have a list action, so I'll have Scout look them up.Scout · List open PRs",
      "Read a web page×16",
    ]);
    // Three lines: nothing earlier to fold.
    expect(toggle()).toBeNull();

    // One more page read: the same line counts it.
    draw({ steps: [did("Looked at your apps"), did("Looked at your apps"), handed, ...Array.from({ length: 17 }, () => did("Read a web page"))], live: true });
    expect(lines().at(-1)).toBe("Read a web page×17");
    expect(lines()).toHaveLength(3);
  });

  it("is skipped by screen readers and the keyboard while the turn is written, and reachable after", () => {
    draw({ steps: steps(5), live: true });
    expect(host.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(toggle()?.tabIndex).toBe(-1);
    draw({ steps: steps(5) });
    expect(host.firstElementChild?.hasAttribute("aria-hidden")).toBe(false);
    expect(toggle()?.tabIndex).toBe(0);
    expect(toggle()?.type).toBe("button");
  });
});
