// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClampedText } from "./clamped-text";

// A long instruction in a draft's card: cut to three lines, with "Show more" to read it all and
// "Show less" to fold it again; a short one shows whole, with no button.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
/** How tall the text is, against the three lines it is cut to (a page without layout says 0). */
let full = 0;
const CUT = 60;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => full });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => CUT });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function show(text: string) {
  root = createRoot(host);
  act(() => root.render(createElement(ClampedText, { text })));
  return host.querySelector("p")!;
}

const button = () => host.querySelector("button");

describe("a text cut to a few lines", () => {
  it("shows a short text whole, with no button", () => {
    full = 40;
    const p = show("Check GitHub.");
    expect(p.textContent).toBe("Check GitHub.");
    expect(button()).toBeNull();
  });

  it("cuts a long text to three lines, and Show more / Show less open and fold it", () => {
    full = 140;
    const p = show("Every day at 5:20 AM IST, check GitHub for any open pull requests. ".repeat(4));
    expect(p.className).toContain("line-clamp-3");
    expect(button()?.textContent).toBe("Show more");
    expect(button()?.getAttribute("aria-expanded")).toBe("false");

    act(() => button()!.click());
    expect(p.className).not.toContain("line-clamp-3");
    expect(button()?.textContent).toBe("Show less");
    expect(button()?.getAttribute("aria-expanded")).toBe("true");

    act(() => button()!.click());
    expect(p.className).toContain("line-clamp-3");
    expect(button()?.textContent).toBe("Show more");
  });
});
