// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api/hooks", () => ({
  useMe: () => ({ data: undefined }),
  useCrew: () => ({ data: undefined }),
  useAutoTopUp: () => ({ data: undefined }),
}));

import { HELP_SECTIONS } from "@/lib/help-content";
import HelpPage from "@/app/(app)/help/page";
import { toggled, topicIdFromHash } from "./help-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, enabled: false } } });
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(HelpPage)));
  });
}
const button = (id: string) => container.querySelector<HTMLButtonElement>(`button[aria-controls="${id}-panel"]`)!;

beforeEach(() => {
  window.location.hash = "";
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("the questions as an accordion", () => {
  it("opens and closes one question at a time, on a press", async () => {
    await mount();
    expect(button("apps-gmail").getAttribute("aria-expanded")).toBe("false");
    await act(async () => button("apps-gmail").click());
    expect(button("apps-gmail").getAttribute("aria-expanded")).toBe("true");
    expect(button("approvals-why").getAttribute("aria-expanded")).toBe("false");
    await act(async () => button("apps-gmail").click());
    expect(button("apps-gmail").getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the question a #id link points at, and scrolls to it", async () => {
    window.location.hash = "#credits-zero";
    await mount();
    expect(button("credits-zero").getAttribute("aria-expanded")).toBe("true");
    expect(button("credits-plans").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1);
  });

  it("opens an answer when the address changes while the page is open", async () => {
    await mount();
    await act(async () => {
      window.location.hash = "#telegram-link";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(button("telegram-link").getAttribute("aria-expanded")).toBe("true");
  });

  it("opens every answer found while searching", async () => {
    await mount();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "composio");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("apps-composio").getAttribute("aria-expanded")).toBe("true");
  });

  it("says No answer found, with Email support, when nothing matches", async () => {
    await mount();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "xylophone");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("No answer found");
    expect(container.querySelector('a[href^="mailto:support@textcrew.in"]')).not.toBeNull();
  });

  it("jumps to a section from its chip", async () => {
    await mount();
    const chips = container.querySelector('nav[aria-label="Help sections"]')!;
    expect([...chips.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(HELP_SECTIONS.map((section) => `#${section.id}`));
  });
});

describe("the accordion's rules", () => {
  it("reads an answer's id from an address, and nothing for a section or a stranger", () => {
    expect(topicIdFromHash("#apps-gmail", HELP_SECTIONS)).toBe("apps-gmail");
    expect(topicIdFromHash("#apps", HELP_SECTIONS)).toBeNull();
    expect(topicIdFromHash("", HELP_SECTIONS)).toBeNull();
    expect(topicIdFromHash("#nope", HELP_SECTIONS)).toBeNull();
  });

  it("toggles an id in a set without changing the old one", () => {
    const one = new Set(["a"]);
    expect([...toggled(one, "b")]).toEqual(["a", "b"]);
    expect([...toggled(one, "a")]).toEqual([]);
    expect([...one]).toEqual(["a"]);
  });
});
