"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * The widths at which the parts of the shell that CSS hides are on screen. Each is the opposite of
 * a breakpoint in the markup: the sidebar is `max-md:hidden` (below 48rem), the chat's side panel
 * `max-[1100px]:hidden`.
 */
export const SHOWN_AT = {
  sidebar: "(min-width: 48rem)",
  sidePanel: "(min-width: 1100px)",
} as const;

type Store = { subscribe: (onChange: () => void) => () => void; getSnapshot: () => boolean; getServerSnapshot: () => boolean };

/**
 * Whether the browser window matches `query`, and a way to hear when that changes. On the server,
 * and in the first render in the browser, it doesn't match: what is drawn only on a wide screen is
 * left out until the browser has said the screen is wide, so a phone never fetches its data.
 */
export function mediaQueryStore(query: string): Store {
  return {
    subscribe(onChange) {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    getSnapshot: () => window.matchMedia(query).matches,
    getServerSnapshot: () => false,
  };
}

export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => mediaQueryStore(query), [query]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
