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

/** About as many frames as a panel takes to fold (`PANEL_MS`), and a few more. */
const FOCUS_TRIES = 20;

/**
 * After a button that folds or opens a panel is pressed, the button that undoes it may be the one
 * that has just been folded away with its panel. If the pressed button had the keyboard, it goes
 * to the button with this id once the page has caught up. That button may still be on its way in
 * (hidden until its first frame on screen), so it is tried again each frame for as long as a fold
 * takes, while the keyboard is nowhere else.
 */
export function focusAfterToggle(pressed: Element, id: string): void {
  if (document.activeElement !== pressed) return;
  const lost = () => !document.activeElement || document.activeElement === document.body || document.activeElement === pressed;
  let tries = 0;
  const attempt = () => {
    if (!lost()) return;
    document.getElementById(id)?.focus();
    tries += 1;
    if (lost() && tries < FOCUS_TRIES) window.requestAnimationFrame(attempt);
  };
  window.requestAnimationFrame(attempt);
}

