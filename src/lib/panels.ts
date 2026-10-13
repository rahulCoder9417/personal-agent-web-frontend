"use client";

import { storedFlag } from "./stored-flag";

/**
 * The panels the person can fold away, each remembered by this browser under its own key
 * (`storedFlag`). Folding one never folds another.
 *
 * - `nav`: the sidebar on the left of every screen, folded down to a rail of icons (from 768px).
 * - `chats`: the chat history beside the thread (from 1024px; below that it is a drawer).
 * - `sidePanel`: the chat's panel on the right, "Right now" (where there is room for it).
 */
export const PANELS = {
  nav: storedFlag("textcrew.nav.collapsed"),
  chats: storedFlag("textcrew.chats.hidden"),
  sidePanel: storedFlag("textcrew.sidepanel.hidden"),
} as const;

/**
 * After a button that folds or opens a panel is pressed, the button that undoes it may be the one
 * that has just been folded away with its panel. If the pressed button had the keyboard, it goes
 * to the button with this id once the page has caught up.
 */
export function focusAfterToggle(pressed: Element, id: string): void {
  if (document.activeElement !== pressed) return;
  window.requestAnimationFrame(() => document.getElementById(id)?.focus());
}
