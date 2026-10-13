import { afterEach, describe, expect, it, vi } from "vitest";
import { motionReadyStore, PANEL_MOTION, withLeaving, type Presence } from "./motion";

type Row = { id: string; title: string };
const row = (id: string, title = id): Row => ({ id, title });
const key = (item: Row) => item.id;

/** What is drawn, in order: `a` there, `+a` arriving, `-a` leaving. */
const shape = (drawn: Presence<Row>[]) => drawn.map((entry) => `${entry.leaving ? "-" : entry.entering ? "+" : ""}${entry.key}`).join(" ");

describe("withLeaving: a list that keeps what has gone for a moment", () => {
  it("draws a list that loads as it is, with nothing arriving", () => {
    expect(shape(withLeaving(null, [row("a"), row("b")], key))).toBe("a b");
    expect(shape(withLeaving(null, [], key))).toBe("");
  });

  it("marks a new chat at the top, or a page of older ones at the end, as arriving", () => {
    const first = withLeaving(null, [row("a"), row("b")], key);
    expect(shape(withLeaving(first, [row("new"), row("a"), row("b")], key))).toBe("+new a b");
    expect(shape(withLeaving(first, [row("a"), row("b"), row("c"), row("d")], key))).toBe("a b +c +d");
    // Arriving lasts one drawing: the next time it is simply there.
    const next = withLeaving(first, [row("new"), row("a"), row("b")], key);
    expect(shape(withLeaving(next, [row("new"), row("a"), row("b")], key))).toBe("new a b");
  });

  it("keeps a deleted chat where it was, leaving, so it can fold shut there", () => {
    const first = withLeaving(null, [row("a"), row("b"), row("c")], key);
    expect(shape(withLeaving(first, [row("a"), row("c")], key))).toBe("a -b c");
    expect(shape(withLeaving(first, [row("b"), row("c")], key))).toBe("-a b c");
    expect(shape(withLeaving(first, [row("a"), row("b")], key))).toBe("a b -c");
    expect(shape(withLeaving(first, [], key))).toBe("-a -b -c");
  });

  it("keeps a chat leaving while the list changes again, until it is let go", () => {
    const first = withLeaving(null, [row("a"), row("b"), row("c")], key);
    const gone = withLeaving(first, [row("a"), row("c")], key);
    // Something is said in c: it moves to the top while b is still folding.
    expect(shape(withLeaving(gone, [row("c"), row("a")], key))).toBe("c a -b");
    // A second one goes before the first has finished.
    expect(shape(withLeaving(gone, [row("c")], key))).toBe("-a -b c");
  });

  it("brings back a chat that comes back while it was leaving", () => {
    const first = withLeaving(null, [row("a"), row("b")], key);
    const gone = withLeaving(first, [row("a")], key);
    expect(shape(withLeaving(gone, [row("a"), row("b")], key))).toBe("a b");
  });

  it("draws each item as it is now, and a leaving one as it was last seen", () => {
    const first = withLeaving(null, [row("a", "Old title"), row("b")], key);
    const renamed = withLeaving(first, [row("a", "New title"), row("b")], key);
    expect(renamed[0]?.item.title).toBe("New title");
    const gone = withLeaving(renamed, [row("b")], key);
    expect(gone[0]).toMatchObject({ key: "a", leaving: true, item: { title: "New title" } });
  });
});

describe("motionReadyStore: nothing moves until the page has been drawn once", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says no on the server and in the first render", () => {
    expect(motionReadyStore().getServerSnapshot()).toBe(false);
  });

  it("says yes two frames after the page first listens, and tells whoever is listening", () => {
    const frames: (() => void)[] = [];
    vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
    const store = motionReadyStore();
    const changed = vi.fn();
    store.subscribe(changed);
    store.subscribe(vi.fn());
    // Asked for once, however many listen.
    expect(frames).toHaveLength(1);
    expect(store.getSnapshot()).toBe(false);

    frames.shift()?.();
    expect(store.getSnapshot()).toBe(false);
    frames.shift()?.();
    expect(store.getSnapshot()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);

    // Once ready, a new listener asks for nothing more.
    store.subscribe(vi.fn());
    expect(frames).toHaveLength(0);
  });
});

describe("PANEL_MOTION", () => {
  it("moves for 225ms, and not at all for someone who asked for less motion", () => {
    expect(PANEL_MOTION.split(" ")).toEqual(expect.arrayContaining(["duration-[225ms]", "motion-reduce:transition-none"]));
  });
});
