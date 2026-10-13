"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Conversation } from "./api/client";
import { automationsUnread, lastSpokenAt, seenToRemember, type AutomationsSeen } from "./conversations";

// Up to when this browser has seen the Automations chat, so a run that arrives while it isn't open
// lights its mark. A convenience kept in `localStorage`: where storage is blocked it holds for as
// long as the page stays open, and on another device the mark starts from what is there.

const KEY = "textcrew.automationsSeen";

let held: AutomationsSeen | null | undefined;
let raw: string | null | undefined;
let parsed: AutomationsSeen | null = null;
const listeners = new Set<() => void>();

function read(): AutomationsSeen | null {
  if (held !== undefined) return held;
  let text: string | null = null;
  try {
    text = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  // The same text gives the same object, so React sees no change.
  if (text === raw) return parsed;
  raw = text;
  try {
    const value = text ? (JSON.parse(text) as Partial<AutomationsSeen>) : null;
    parsed = value && typeof value.id === "string" && typeof value.at === "string" ? { id: value.id, at: value.at } : null;
  } catch {
    parsed = null;
  }
  return parsed;
}

function write(seen: AutomationsSeen): void {
  held = seen;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Storage is blocked: it holds until the page is closed.
  }
  for (const listener of [...listeners]) listener();
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

/**
 * Whether the Automations chat has something new in it that wasn't seen. While it is `open`, what
 * arrives counts as seen. The first time this browser meets an Automations chat, what is already
 * in it counts as seen too.
 */
export function useAutomationsUnread(chat: Conversation | null, open: boolean): boolean {
  const seen = useSyncExternalStore(subscribe, read, () => null);
  useEffect(() => {
    if (!chat) return;
    const remembered = read();
    const first = seenToRemember(chat, remembered);
    if (first) write(first);
    const at = lastSpokenAt(chat);
    if (open && (first ?? remembered)?.at !== at) write({ id: chat.id, at });
  }, [chat, open]);
  return automationsUnread(chat, seen, open);
}

/** Tests start from nothing remembered. */
export function forgetAutomationsSeen(): void {
  held = undefined;
  raw = undefined;
  parsed = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
