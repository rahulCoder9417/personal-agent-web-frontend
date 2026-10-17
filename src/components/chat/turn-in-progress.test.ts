// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The turn in progress has exactly one Tex logo, beside everything of the turn, from the start
// ("Tex is working…") through the steps and the text being written.

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import type { DraftStep } from "@/lib/drafts";
import { TurnInProgress } from "./thread";

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

const step = (text: string): DraftStep => ({ text, progress: [], action: true });
const draw = (props: { steps: readonly DraftStep[]; writing: string | null; start: boolean; working?: boolean }) =>
  act(() => root.render(createElement(TurnInProgress, { lines: [], ...props })));
const logos = () => host.querySelectorAll('svg[aria-label="Tex"]');

describe("TurnInProgress", () => {
  it("shows one Tex logo beside the working bubble at the start", () => {
    draw({ steps: [], writing: null, start: true });
    expect(logos()).toHaveLength(1);
    expect(host.textContent).toContain("Tex is working…");
  });

  it("shows one Tex logo with steps on screen", () => {
    draw({ steps: [step("Looked in GitHub"), step("Looked at your apps")], writing: null, start: false });
    expect(logos()).toHaveLength(1);
    expect(host.textContent).toContain("Looked in GitHub");
  });

  it("shows one Tex logo with steps and the text being written", () => {
    draw({ steps: [step("Looked in GitHub")], writing: "Here is what", start: false });
    expect(logos()).toHaveLength(1);
    expect(host.textContent).toContain("Here is what");
  });

  it("keeps one logo when the turn ended without an answer", () => {
    draw({ steps: [step("Looked in GitHub")], writing: null, start: false, working: false });
    expect(logos()).toHaveLength(1);
  });
});
