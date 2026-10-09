"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onInView` when `target` comes into view, and at once if it already is when watching
 * starts. Watching starts again each time `enabled` turns on: a list still shorter than its pane
 * after one more page then asks for the next, and so on until the pane is full or the list ends.
 */
export function useInView(target: RefObject<Element | null>, onInView: () => void, enabled: boolean) {
  const callback = useRef(onInView);
  useEffect(() => {
    callback.current = onInView;
  }, [onInView]);

  useEffect(() => {
    const element = target.current;
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) callback.current();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, enabled]);
}
