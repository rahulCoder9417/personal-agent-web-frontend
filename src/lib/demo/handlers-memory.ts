// The shared memory for the demo account: the list and the two deletes the app can do, and the
// saving that only Tex does (asked for in chat with "remember that…").

import type { Memory } from "@/lib/api/client";
import { nowIso, truncate, upperFirst, type Handler } from "./context";
import { json, noContent, notFound } from "./http";
import { MEMORY_MAX } from "./seed";
import { logActivity, nextId, type DemoState } from "./store";

const MEMORY_MAX_CHARS = 300;

export const listMemories: Handler = ({ state }) => json({ items: state.memories, max: MEMORY_MAX });

export const deleteMemory: Handler = ({ state, params }) => {
  const memory = state.memories.find((item) => item.id === params.memoryId);
  if (!memory) throw notFound("Memory not found");
  state.memories = state.memories.filter((item) => item !== memory);
  // The log names the memory and never holds its text, so the text is gone with it.
  logActivity(state, { actor: "user", action: "memory_deleted", summary: "Deleted a memory", memoryId: memory.id });
  return noContent();
};

export const deleteAllMemories: Handler = ({ state }) => {
  const deleted = state.memories.length;
  state.memories = [];
  if (deleted > 0) logActivity(state, { actor: "user", action: "memories_cleared", summary: `Deleted all memories (${deleted})` });
  return json({ deleted });
};

// ---------------------------------------------------------------- what Tex does with it

/** "Remember that I take my coffee black" → the fact to save. Null when the message asks for something else. */
export function memoryRequestOf(text: string): string | null {
  const asked = /^\s*(?:please\s+)?remember(?:\s+that)?\s+([\s\S]+)$/i.exec(text);
  return asked ? asked[1].trim() : null;
}

// What the backend refuses to save, by what it looks like.
const SECRETS: readonly { looksLike: RegExp; name: string }[] = [
  { looksLike: /\b(sk|pk|ghp|xox[abp])[-_][A-Za-z0-9_-]{8,}/, name: "an API key" },
  { looksLike: /\bapi[\s_-]?key\b|\btoken\b/i, name: "an API key" },
  { looksLike: /\bpass(word|code)\b|\bpin\b/i, name: "a password" },
  { looksLike: /\b(?:\d[ -]?){13,19}\b/, name: "a card number" },
];

const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Tex saves one fact, the way the backend's `remember` tool does: a secret is refused (and logged,
 * without the text), the same fact again is confirmed rather than saved twice, and at the limit
 * nothing more fits. Returns what Tex says back.
 */
export function rememberFact(state: DemoState, fact: string): string {
  const secret = SECRETS.find((kind) => kind.looksLike.test(fact));
  if (secret) {
    logActivity(state, { actor: "agent", action: "memory_refused", summary: `Refused to save a memory: it looked like ${secret.name}` });
    return "I don’t save passwords, keys or card numbers, so I haven’t kept that. Connect the app in Integrations instead and I’ll use it from there.";
  }

  const content = upperFirst(truncate(fact, MEMORY_MAX_CHARS));
  const known = state.memories.find((memory) => sameText(memory.content, content));
  if (known) {
    logActivity(state, { actor: "agent", action: "remember", summary: `Confirmed a memory (${known.kind})`, memoryId: known.id });
    return "I already had that saved. Still noted.";
  }
  if (state.memories.length >= MEMORY_MAX) return "My memory is full. Delete something under Settings → Memory and tell me again.";

  const now = nowIso();
  const memory: Memory = { id: nextId(state, "mem"), kind: "fact", content, createdAt: now, updatedAt: now, lastUsedAt: null, useCount: 0 };
  state.memories.unshift(memory);
  logActivity(state, { actor: "agent", action: "remember", summary: `Saved a memory (${memory.kind})`, memoryId: memory.id });
  return "Saved. I’ll remember that, whichever AI I’m running on. You can see or delete it under Settings → Memory.";
}
