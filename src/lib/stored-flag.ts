"use client";

import { useSyncExternalStore } from "react";

type Store = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
  getServerSnapshot: () => boolean;
  set: (on: boolean) => void;
};

/**
 * A yes or no this browser remembers (a column the person folded away), kept in `localStorage`.
 * It is a convenience only: where storage is blocked or empty (a private window) the answer is no
 * until it is set, and then it holds for as long as the page stays open. On the server, and in the
 * first render in the browser, it is no.
 */
export function storedFlag(key: string): Store {
  let held: boolean | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot() {
      if (held !== null) return held;
      try {
        return window.localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    getServerSnapshot: () => false,
    set(on) {
      held = on;
      try {
        if (on) window.localStorage.setItem(key, "1");
        else window.localStorage.removeItem(key);
      } catch {
        // Storage is blocked: the choice still holds until the page is closed.
      }
      for (const listener of [...listeners]) listener();
    },
  };
}

export function useStoredFlag(store: Store): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
