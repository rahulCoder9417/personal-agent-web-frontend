import { afterEach, describe, expect, it, vi } from "vitest";
import { focusAfterToggle, PANELS } from "./panels";

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const flag of Object.values(PANELS)) flag.set(false);
});

describe("PANELS: what this browser remembers about the panels", () => {
  it("starts with every panel open", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    for (const flag of Object.values(PANELS)) {
      expect(flag.getServerSnapshot()).toBe(false);
    }
  });

  it("remembers each panel under its own key, and folding one never folds another", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });

    PANELS.nav.set(true);
    expect([PANELS.nav.getSnapshot(), PANELS.chats.getSnapshot(), PANELS.sidePanel.getSnapshot()]).toEqual([true, false, false]);
    PANELS.sidePanel.set(true);
    expect([PANELS.nav.getSnapshot(), PANELS.chats.getSnapshot(), PANELS.sidePanel.getSnapshot()]).toEqual([true, false, true]);
    // The chat history keeps the key it always had, so a choice made before this still holds.
    PANELS.chats.set(true);
    expect([...storage.items.keys()].sort()).toEqual(["textcrew.chats.hidden", "textcrew.nav.collapsed", "textcrew.sidepanel.hidden"]);

    PANELS.nav.set(false);
    expect(storage.items.has("textcrew.nav.collapsed")).toBe(false);
    expect([PANELS.nav.getSnapshot(), PANELS.chats.getSnapshot(), PANELS.sidePanel.getSnapshot()]).toEqual([false, true, true]);
  });
});

describe("focusAfterToggle", () => {
  /** A page whose button with the id `chats-show` takes the keyboard from the `ready`th try on. */
  function page(pressed: object, ready = 1) {
    const body = {};
    const doc = { activeElement: pressed as unknown, body, getElementById: (id: string) => (id === "chats-show" ? target : null) };
    const target = {
      focus: vi.fn(() => {
        if (target.focus.mock.calls.length >= ready) doc.activeElement = target;
      }),
    };
    const frames: (() => void)[] = [];
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
    const runFrames = () => {
      while (frames.length > 0) frames.shift()?.();
    };
    return { doc, body, target, frames, runFrames };
  }

  it("gives the keyboard to the button that undoes it, once the page has caught up", () => {
    const pressed = {} as Element;
    const { doc, target, frames, runFrames } = page(pressed);
    focusAfterToggle(pressed, "chats-show");
    expect(target.focus).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    runFrames();
    expect(target.focus).toHaveBeenCalledTimes(1);
    expect(doc.activeElement).toBe(target);
  });

  it("tries again while that button is still on its way in, and no longer than a fold takes", () => {
    const pressed = {} as Element;
    const arriving = page(pressed, 3);
    focusAfterToggle(pressed, "chats-show");
    arriving.runFrames();
    expect(arriving.target.focus).toHaveBeenCalledTimes(3);
    expect(arriving.doc.activeElement).toBe(arriving.target);

    const never = page(pressed, Infinity);
    focusAfterToggle(pressed, "chats-show");
    never.runFrames();
    expect(never.target.focus).toHaveBeenCalledTimes(20);
  });

  it("stops as soon as the keyboard has gone somewhere else", () => {
    const pressed = {} as Element;
    const { doc, target, frames } = page(pressed, Infinity);
    focusAfterToggle(pressed, "chats-show");
    frames.shift()?.();
    expect(target.focus).toHaveBeenCalledTimes(1);
    // The person tabbed on while the button was still arriving.
    doc.activeElement = { elsewhere: true };
    frames.shift()?.();
    expect(target.focus).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
  });

  it("leaves the keyboard alone when the pressed button didn't have it", () => {
    const pressed = {} as Element;
    const { target, frames } = page({});
    focusAfterToggle(pressed, "chats-show");
    expect(frames).toHaveLength(0);
    expect(target.focus).not.toHaveBeenCalled();
  });
});
