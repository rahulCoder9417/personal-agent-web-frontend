"use client";

// The blocks beside the canvas: Start when, Read from an app, Tex and the crew, Write or send, from
// the person's connected apps' real events and actions, with a search. A block is dragged onto the
// canvas, or clicked to add it at the end of its lane (or where the "+" that was clicked is). The
// apps not connected yet are listed at the foot, in amber, to connect first.

import type { DragEvent } from "react";
import type { App } from "@/lib/api/client";
import type { BlockGroup, PaletteBlock, PaletteGroup } from "@/lib/automation-palette";
import { cn } from "@/lib/format";
import { CloseIcon, LockIcon, SearchIcon } from "../icons";
import { AppLogo, T2, T3 } from "./parts";

/** The MIME type a dragged block carries (its key), so a drop elsewhere on the page does nothing. */
export const BLOCK_TYPE = "application/x-textcrew-block";

function Grip() {
  return (
    <svg width={10} height={16} viewBox="0 0 10 16" fill="currentColor" aria-hidden className="shrink-0 text-[#c9c4ba]">
      {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1.3" />, <circle key={`b${y}`} cx="8" cy={y} r="1.3" />])}
    </svg>
  );
}

export type PaletteProps = {
  groups: readonly PaletteGroup[];
  query: string;
  onQuery: (query: string) => void;
  onPick: (block: PaletteBlock) => void;
  onDragStart: (block: PaletteBlock) => void;
  onDragEnd: () => void;
  /** After a "+": where the next block goes, in words, and the way to cancel it. */
  pending: { label: string; onCancel: () => void } | null;
  notConnected: readonly App[];
  onConnect: (app: App) => void;
  /** Blocks can't be dragged (a phone): they are clicked. */
  compact: boolean;
  loading: boolean;
  dragging: string | null;
};

export function Palette({ groups, query, onQuery, onPick, onDragStart, onDragEnd, pending, notConnected, onConnect, compact, loading, dragging }: PaletteProps) {
  const start = (block: PaletteBlock) => (event: DragEvent) => {
    event.dataTransfer.setData(BLOCK_TYPE, block.key);
    event.dataTransfer.setData("text/plain", block.label);
    event.dataTransfer.effectAllowed = "copy";
    onDragStart(block);
  };
  const empty = groups.every((group) => group.blocks.length === 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className={cn(T2, "font-semibold")}>Blocks</h2>
        <p className={cn(T3, "text-muted")}>{compact ? "Tap one to add it." : "Drag one onto the canvas, or click it to add it."}</p>
      </div>

      {pending && (
        <div role="status" className={cn(T3, "flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-accent-dark")}>
          <span className="min-w-0 flex-1 font-medium">{pending.label}</span>
          <button type="button" onClick={pending.onCancel} aria-label="Cancel adding a step here" className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-white/70">
            <CloseIcon size={12} strokeWidth={2.4} />
          </button>
        </div>
      )}

      <label className="flex h-9 items-center gap-2 rounded-[10px] bg-bg px-3 focus-within:shadow-[inset_0_0_0_2px_var(--accent)]">
        <SearchIcon size={16} className="shrink-0 text-muted" />
        <span className="sr-only">Search blocks</span>
        <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search apps and actions" className={cn(T2, "min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted")} />
      </label>

      {empty && query.trim() && <p className={cn(T3, "text-muted")}>No block matches “{query.trim()}”.</p>}

      {groups.map((group) => (
        <div key={group.group} role="group" aria-label={group.title} className="flex flex-col gap-1">
          <h3 className={cn(T3, "flex items-center justify-between px-2 pb-2 font-semibold text-muted")}>
            {group.title}
            {group.optional && <span className="font-medium text-faint">optional</span>}
          </h3>
          {group.blocks.map((block) => {
            const asks = block.kind === "action" && block.action.requiresApproval;
            return (
              <button
                key={block.key}
                type="button"
                draggable={!compact}
                onDragStart={start(block)}
                onDragEnd={onDragEnd}
                onClick={() => onPick(block)}
                aria-label={`${block.label}, ${block.sub}: add to ${group.title}`}
                className={cn(
                  "flex min-h-[52px] w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-bg",
                  compact ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                  dragging === block.key && "opacity-40",
                )}
              >
                {!compact && <Grip />}
                <AppLogo slug={block.logo} size={28} />
                <span className="flex min-w-0 flex-col">
                  <span className={cn(T2, "flex items-center gap-1 font-medium")}>
                    <span className="truncate">{block.label}</span>
                    {asks && <LockIcon size={12} className="shrink-0 text-muted" aria-label="Asks you first" />}
                  </span>
                  <span className={cn(T3, "truncate text-muted")}>{block.sub}</span>
                </span>
              </button>
            );
          })}
          {loading && (group.group === "read" || group.group === "write" || group.group === "start") && group.blocks.length < 3 && (
            <span className={cn(T3, "px-2 text-muted")}>Loading your apps’ {group.group === "start" ? "events" : "actions"}…</span>
          )}
          {group.hidden > 0 && <span className={cn(T3, "px-2 text-muted")}>Search to see {group.hidden} more.</span>}
          {!loading && group.blocks.length === 0 && (group.group === "read" || group.group === "write") && !query.trim() && (
            <span className={cn(T3, "px-2 text-muted")}>Connect an app to {group.group === "read" ? "read from it" : "write to it"}.</span>
          )}
        </div>
      ))}

      {notConnected.length > 0 && !pendingOnlyTex(groups) && (
        <div role="group" aria-label="Apps to connect first" className="flex flex-col gap-1">
          <h3 className={cn(T3, "px-2 pb-2 font-semibold text-muted")}>More apps</h3>
          {notConnected.map((app) => (
            <button key={app.slug} type="button" onClick={() => onConnect(app)} className="flex min-h-[52px] w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-bg">
              {!compact && <span className="w-[10px] shrink-0" />}
              <AppLogo slug={app.slug} size={28} iconUrl={app.iconUrl} />
              <span className="flex min-w-0 flex-col">
                <span className={cn(T2, "truncate font-medium")}>{app.name}</span>
                <span className={cn(T3, "text-warn")}>Connect first</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A "+" that only takes a Tex step has no use for apps to connect. */
function pendingOnlyTex(groups: readonly PaletteGroup[]): boolean {
  return groups.length === 1 && groups[0].group === ("tex" satisfies BlockGroup);
}
