// The shared memory (`/v1/memories`): what Tex has saved about the person. The agent makes the
// memories; the app can only list and delete them. This is the wording, kept apart from React.

import type { Memory } from "./api/client";
import { formatAgo, formatDate } from "./format";

export type MemoryKind = Memory["kind"];

/** The kinds in the order they are shown, standing instructions first: they are the ones Tex must follow. */
export const MEMORY_KINDS: readonly { kind: MemoryKind; label: string }[] = [
  { kind: "instruction", label: "Standing instructions" },
  { kind: "preference", label: "Preferences" },
  { kind: "person", label: "People" },
  { kind: "project", label: "Projects" },
  { kind: "fact", label: "Other facts" },
];

export type MemoryGroup = { kind: MemoryKind; label: string; items: Memory[] };

/** One group per kind that has something in it. Inside a group the API's order stays: newest first. */
export function groupMemories(items: readonly Memory[]): MemoryGroup[] {
  return MEMORY_KINDS.map(({ kind, label }) => ({ kind, label, items: items.filter((memory) => memory.kind === kind) })).filter(
    (group) => group.items.length > 0,
  );
}

/** "5 min ago", "yesterday", "12 Sep": formatAgo, but fit for the middle of a line. */
function ago(iso: string, now: Date): string {
  const text = formatAgo(iso, now);
  return text === "Yesterday" ? "yesterday" : text;
}

/**
 * When a memory was saved and, if Tex corrected it since, when. A correction keeps the memory and
 * changes its text; `updatedAt` equals `createdAt` when that never happened.
 */
export function describeMemorySaved(memory: Pick<Memory, "createdAt" | "updatedAt">, now = new Date()): string {
  const saved = `saved ${formatDate(memory.createdAt, now)}`;
  return memory.updatedAt !== memory.createdAt ? `${saved} · corrected ${formatDate(memory.updatedAt, now)}` : saved;
}

/** How often Tex found it when it searched its memory, and when last. */
export function describeMemoryUse(memory: Pick<Memory, "lastUsedAt" | "useCount">, now = new Date()): string {
  if (!memory.lastUsedAt || memory.useCount <= 0) return "not looked up yet";
  const times = memory.useCount === 1 ? "once" : `${memory.useCount} times`;
  return `looked up ${times}, last ${ago(memory.lastUsedAt, now)}`;
}

/** How much of the memory is used. At the limit Tex can't save anything new. */
export function memoryCapacity(count: number, max: number): { text: string; percent: number; full: boolean } {
  return {
    text: `${count} of ${max} saved`,
    percent: max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 100,
    full: count >= max,
  };
}

/** The Memory screen, opened on one memory. */
export function memoryHref(memoryId: string): string {
  return `/settings/memory?memory=${encodeURIComponent(memoryId)}`;
}
