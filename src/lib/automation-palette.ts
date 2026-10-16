// The blocks beside the canvas, grouped as the lanes are: Start when, Read from an app, Tex and the
// crew, Write or send. They come from the real catalogs the canvas loads for the person's connected
// apps (each app's events, `GET /v1/apps/{app}/events`, and actions, `GET /v1/apps/{app}/actions`):
// an action that only reads is a read block, one that changes something a write block. The apps
// not connected yet are listed apart, to connect first. Nothing here draws.

import type { AppAction, AppEvent } from "./api/client";
import type { EditorParts } from "./automation-editor";
import type { Lane } from "./automation-lanes";
import { emptyStep, type EditorStep } from "./automation-steps";

export type BlockGroup = "start" | Lane;

export const GROUP_TITLE: Record<BlockGroup, string> = {
  start: "Start when",
  read: "Read from an app",
  tex: "Tex and the crew",
  write: "Write or send",
};

type Common = { key: string; group: BlockGroup; label: string; sub: string; logo: string; keywords: string };

export type PaletteBlock =
  | (Common & { kind: "once" | "schedule" })
  | (Common & { kind: "event"; app: string; event: string })
  | (Common & { kind: "action"; app: string; action: AppAction })
  | (Common & { kind: "tex" });

export type PaletteApp = { slug: string; name: string };

const lower = (text: string) => text.toLowerCase();

/** The blocks there always are: once, on a schedule, and Tex. */
const ONCE: PaletteBlock = { kind: "once", key: "once", group: "start", label: "Once", sub: "At a day and time", logo: "once", keywords: "once reminder date time later" };
const SCHEDULE: PaletteBlock = {
  kind: "schedule",
  key: "schedule",
  group: "start",
  label: "On a schedule",
  sub: "Daily, weekly or every few hours",
  logo: "schedule",
  keywords: "schedule daily weekly every day hour cron repeat",
};
const TEX: PaletteBlock = { kind: "tex", key: "tex", group: "tex", label: "Ask Tex", sub: "Decide, sum up, write", logo: "tex", keywords: "tex decide sum up summarise write draft pick" };

// The actions people reach for first, most used first, so an app's few shown blocks are the useful ones.
const READ_FIRST = ["fetch", "list", "search", "get", "find", "read"];
const WRITE_FIRST = ["send", "create", "reply", "post", "comment", "add", "update"];

function byUse(actions: readonly AppAction[], first: readonly string[]): AppAction[] {
  const rank = (name: string) => {
    const words = name.toLowerCase().split(/[^a-z]+/);
    const at = first.findIndex((word) => words.includes(word));
    return at === -1 ? first.length : at;
  };
  return actions
    .map((action, index) => ({ action, index, rank: rank(action.name) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.action);
}

/**
 * Every block on offer for the person's usable apps (connected, working and on the plan), in the
 * order the groups and apps are drawn: once and on a schedule, then each app's events; each app's
 * reading actions; Tex; each app's writing actions. An app whose list hasn't loaded has no blocks
 * yet.
 */
export function paletteBlocks(
  apps: readonly PaletteApp[],
  events: ReadonlyMap<string, readonly AppEvent[]>,
  actions: ReadonlyMap<string, readonly AppAction[]>,
): PaletteBlock[] {
  const start: PaletteBlock[] = [ONCE, SCHEDULE];
  const read: PaletteBlock[] = [];
  const write: PaletteBlock[] = [];
  for (const app of apps) {
    for (const event of events.get(app.slug) ?? []) {
      start.push({ kind: "event", key: `event:${app.slug}:${event.slug}`, group: "start", label: event.name, sub: app.name, logo: app.slug, app: app.slug, event: event.slug, keywords: lower(`${app.name} ${event.description} ${event.slug}`) });
    }
    const list = actions.get(app.slug) ?? [];
    for (const action of byUse(list.filter((item) => !item.changesSomething), READ_FIRST)) {
      read.push({ kind: "action", key: `action:${app.slug}:${action.slug}`, group: "read", label: action.name, sub: app.name, logo: app.slug, app: app.slug, action, keywords: lower(`${app.name} ${action.description} ${action.slug}`) });
    }
    for (const action of byUse(list.filter((item) => item.changesSomething), WRITE_FIRST)) {
      write.push({ kind: "action", key: `action:${app.slug}:${action.slug}`, group: "write", label: action.name, sub: app.name, logo: app.slug, app: app.slug, action, keywords: lower(`${app.name} ${action.description} ${action.slug}`) });
    }
  }
  return [...start, ...read, TEX, ...write];
}

/** Whether a block has every word typed, in its name, its app or what it does. */
export function blockMatches(block: PaletteBlock, query: string): boolean {
  const words = lower(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = lower(`${block.label} ${block.sub} ${block.keywords}`);
  return words.every((word) => text.includes(word));
}

export type PaletteGroup = {
  group: BlockGroup;
  title: string;
  /** Reading and writing are optional. */
  optional: boolean;
  blocks: PaletteBlock[];
  /** Blocks left out to keep the list short (a few per app until something is typed). */
  hidden: number;
};

/**
 * The blocks in their groups, matching what is typed. Until something is typed, each app shows at
 * most `perApp` blocks in a group (the rest are found by searching). `only` keeps the groups that
 * can go where the person clicked "+".
 */
export function paletteGroups(blocks: readonly PaletteBlock[], query: string, options: { perApp?: number; only?: ReadonlySet<BlockGroup> } = {}): PaletteGroup[] {
  const perApp = options.perApp ?? 4;
  const searching = query.trim().length > 0;
  const groups: PaletteGroup[] = [];
  for (const group of ["start", "read", "tex", "write"] as const) {
    if (options.only && !options.only.has(group)) continue;
    const matching = blocks.filter((block) => block.group === group && blockMatches(block, query));
    let shown = matching;
    if (!searching) {
      const seen = new Map<string, number>();
      shown = matching.filter((block) => {
        if (block.kind !== "event" && block.kind !== "action") return true;
        const count = (seen.get(block.app) ?? 0) + 1;
        seen.set(block.app, count);
        return count <= perApp;
      });
    }
    if (matching.length === 0 && searching) continue;
    groups.push({ group, title: GROUP_TITLE[group], optional: group === "read" || group === "write", blocks: shown, hidden: matching.length - shown.length });
  }
  return groups;
}

/** The step a block puts on the canvas: an app's action in its lane (asking first when it must), or a Tex step. Null for a trigger block. */
export function blockStep(block: PaletteBlock, id: string): EditorStep | null {
  if (block.kind === "tex") return emptyStep("tex", id);
  if (block.kind !== "action") return null;
  const risky = block.action.requiresApproval;
  return {
    ...emptyStep("action", id),
    app: block.app,
    action: block.action.slug,
    risky,
    askFirst: risky,
    lane: block.group === "write" ? "write" : "read",
  };
}

/** The parts with a trigger block as the trigger: once, a schedule, or that app's event (its settings start empty). */
export function withTriggerBlock(editor: EditorParts, block: PaletteBlock): EditorParts {
  if (block.kind === "once") return { ...editor, mode: "once" };
  if (block.kind === "schedule") return { ...editor, mode: "schedule" };
  if (block.kind === "event") {
    const same = editor.event.app === block.app && editor.event.event === block.event;
    return { ...editor, mode: "event", event: same ? editor.event : { app: block.app, event: block.event, config: {} } };
  }
  return editor;
}

/** Whether a block starts a run (it replaces the trigger) rather than being a step. */
export function isTriggerBlock(block: PaletteBlock): boolean {
  return block.group === "start";
}
