"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useMarkConversationRead } from "./api/hooks";

// The conversation on screen is being read: whatever is unread in it is marked read, so its mark
// doesn't come up in the list (here, in another tab, or on another device).

const subscribe = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** Whether the page is on screen: false in a background tab, a minimised window or a phone's other app. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, () => document.visibilityState === "visible", () => false);
}

/**
 * Marks the conversation that is shown (`id`, null for none) read whenever it has something
 * `unread`: when it is opened, and each time a message from Tex arrives in it while it is shown.
 * Only while the page is on screen: in a tab nobody is looking at, what arrives stays unread until
 * the tab is shown again. An older backend never says a conversation is unread, so nothing is
 * asked of it.
 */
export function useReadWhileShown(id: string | null, unread: boolean): void {
  const visible = usePageVisible();
  const { mutate: markRead } = useMarkConversationRead();
  useEffect(() => {
    if (id !== null && unread && visible) markRead(id);
  }, [id, unread, visible, markRead]);
}
