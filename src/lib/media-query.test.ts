import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaQueryStore, SHOWN_AT } from "./media-query";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

/** A window whose width can be changed, with matchMedia for `(min-width: …px|rem)` queries. */
function fakeWindow(width: number) {
  const lists: { query: string; listeners: Set<() => void> }[] = [];
  const min = (query: string) => {
    const [, value, unit] = /\(min-width: ([\d.]+)(px|rem)\)/.exec(query) ?? [];
    return Number(value) * (unit === "rem" ? 16 : 1);
  };
  const win = {
    width,
    matchMedia(query: string) {
      const entry = { query, listeners: new Set<() => void>() };
      lists.push(entry);
      return {
        get matches() {
          return win.width >= min(query);
        },
        addEventListener: (_: "change", listener: () => void) => entry.listeners.add(listener),
        removeEventListener: (_: "change", listener: () => void) => entry.listeners.delete(listener),
      };
    },
    resize(next: number) {
      win.width = next;
      for (const entry of lists) for (const listener of entry.listeners) listener();
    },
    listening: () => lists.reduce((sum, entry) => sum + entry.listeners.size, 0),
  };
  return win;
}

afterEach(() => vi.unstubAllGlobals());

describe("mediaQueryStore", () => {
  it("never matches on the server or in the first render, so nothing hidden is fetched before the browser says", () => {
    expect(mediaQueryStore(SHOWN_AT.sidePanel).getServerSnapshot()).toBe(false);
    expect(mediaQueryStore(SHOWN_AT.sidebar).getServerSnapshot()).toBe(false);
  });

  it("matches by the window's width: the side panel from 1100px, the sidebar from 768px", () => {
    const win = fakeWindow(390);
    vi.stubGlobal("window", win);
    const panel = mediaQueryStore(SHOWN_AT.sidePanel);
    const sidebar = mediaQueryStore(SHOWN_AT.sidebar);
    expect([panel.getSnapshot(), sidebar.getSnapshot()]).toEqual([false, false]);
    win.width = 900;
    expect([panel.getSnapshot(), sidebar.getSnapshot()]).toEqual([false, true]);
    win.width = 1099;
    expect(panel.getSnapshot()).toBe(false);
    win.width = 1100;
    expect([panel.getSnapshot(), sidebar.getSnapshot()]).toEqual([true, true]);
    win.width = 767;
    expect(sidebar.getSnapshot()).toBe(false);
  });

  it("tells the page when the window crosses the width, and stops when it is left", () => {
    const win = fakeWindow(390);
    vi.stubGlobal("window", win);
    const store = mediaQueryStore(SHOWN_AT.sidePanel);
    const changed = vi.fn();
    const stop = store.subscribe(changed);
    win.resize(1280);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(true);
    stop();
    expect(win.listening()).toBe(0);
    win.resize(390);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("is the opposite of the breakpoints that hide them in the markup", () => {
    // Tailwind's md is 48rem; the sidebar is hidden below it and the side panel below 1100px.
    expect(SHOWN_AT.sidebar).toBe("(min-width: 48rem)");
    expect(source("components/shell/sidebar.tsx")).toMatch(/className="[^"]*\bmax-md:hidden\b/);
    expect(SHOWN_AT.sidePanel).toBe("(min-width: 1100px)");
    expect(source("components/chat/side-panel.tsx")).toMatch(/className="[^"]*\bmax-\[1100px\]:hidden\b/);
  });
});
