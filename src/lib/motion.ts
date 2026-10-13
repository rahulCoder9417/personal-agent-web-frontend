"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * How long a panel takes to fold away or open (the sidebar, the chat's history and side panel).
 * The classes in `PANEL_MOTION` say the same.
 */
export const PANEL_MS = 225;

/**
 * How a panel moves: for `PANEL_MS`, slowing as it lands; not at all for someone who asked their
 * system for less motion. Add it with the `transition-[…]` that names what moves.
 */
export const PANEL_MOTION = "duration-[225ms] ease-out motion-reduce:transition-none";

type Store = { subscribe: (onChange: () => void) => () => void; getSnapshot: () => boolean; getServerSnapshot: () => boolean };

/**
 * Whether the page has been drawn once in the browser. Until then a panel takes the state this
 * browser remembers (folded away, say) without sliding into it: the page is built before that is
 * known, so it would otherwise slide shut on every load. Two frames: the first is drawn in the
 * remembered state, and only after that may things move.
 */
export function motionReadyStore(): Store {
  let ready = false;
  let asked = false;
  const listeners = new Set<() => void>();
  return {
    subscribe(onChange) {
      listeners.add(onChange);
      if (!ready && !asked) {
        asked = true;
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => {
            ready = true;
            for (const listener of [...listeners]) listener();
          }),
        );
      }
      return () => listeners.delete(onChange);
    },
    getSnapshot: () => ready,
    getServerSnapshot: () => false,
  };
}

const motionReady = motionReadyStore();

/** Whether panels may move yet. See `motionReadyStore`. */
export function useMotionReady(): boolean {
  return useSyncExternalStore(motionReady.subscribe, motionReady.getSnapshot, motionReady.getServerSnapshot);
}

/**
 * Whether what is inside a panel should be drawn: while it is open, and for `ms` after it closes,
 * so it slides away with its contents rather than empty. After that it is let go, and what it
 * asked the API for is no longer kept fresh.
 */
export function useStaysDrawn(open: boolean, ms: number = PANEL_MS): boolean {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open);
  }
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), ms);
    return () => clearTimeout(timer);
  }, [closing, ms]);
  return open || closing;
}

/** One item of a list as it is drawn: arriving (it wasn't there a moment ago), there, or leaving. */
export type Presence<T> = { item: T; key: string; entering: boolean; leaving: boolean };

/**
 * The list to draw when `items` replaces what was drawn before (`previous`, or null the first
 * time): `items` in their order, each marked as arriving if it is new, with the items that have
 * gone kept where they were, marked as leaving, so they can fold away instead of vanishing. On the
 * first drawing nothing is arriving: a list that loads simply appears.
 */
export function withLeaving<T>(previous: Presence<T>[] | null, items: T[], keyOf: (item: T) => string): Presence<T>[] {
  const known = new Set(previous?.map((entry) => entry.key));
  const drawn: Presence<T>[] = items.map((item) => {
    const key = keyOf(item);
    return { item, key, entering: previous !== null && !known.has(key), leaving: false };
  });
  if (!previous) return drawn;

  const kept = new Set(drawn.map((entry) => entry.key));
  // Each one that has gone goes back in just after the one that was above it and is still here.
  let at = 0;
  for (const entry of previous) {
    if (kept.has(entry.key)) {
      at = drawn.findIndex((other) => other.key === entry.key) + 1;
      continue;
    }
    drawn.splice(at, 0, { ...entry, entering: false, leaving: true });
    at += 1;
  }
  return drawn;
}

/**
 * `items` as they should be drawn, with what has just gone kept for `ms` while it folds away (see
 * `withLeaving`). `items` should keep its identity between renders when nothing changed (a
 * `useMemo`), since each new array is taken as a change.
 */
export function usePresence<T>(items: T[], keyOf: (item: T) => string, ms: number = PANEL_MS): Presence<T>[] {
  const [state, setState] = useState(() => ({ items, drawn: withLeaving(null, items, keyOf) }));
  let drawn = state.drawn;
  if (state.items !== items) {
    drawn = withLeaving(state.drawn, items, keyOf);
    setState({ items, drawn });
  }
  const leaving = drawn
    .filter((entry) => entry.leaving)
    .map((entry) => entry.key)
    .join(" ");
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setState((current) => ({ ...current, drawn: current.drawn.filter((entry) => !entry.leaving) })), ms);
    return () => clearTimeout(timer);
  }, [leaving, ms]);
  return drawn;
}
