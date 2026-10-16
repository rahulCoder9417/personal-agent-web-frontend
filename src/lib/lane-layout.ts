// Where the boxes of an automation go on the canvas (`lane-canvas.tsx`): one column, top to bottom,
// in the order of `laneDiagram` (automation-lanes.ts). Each lane's name sits just above its first
// box; between two boxes a line with room for its "+" (and, on the line into a step with an "only
// if", its pill). A box is as tall as it is once drawn (React Flow measures it); until then a
// guess by its kind. Nothing here draws.

import type { LaneDiagram, LaneItem } from "./automation-lanes";

export const BOX_WIDTH = 340;
export const RESULTS_WIDTH = 220;
/** The lane's name above its first box. */
export const HEAD_HEIGHT = 28;
/** The line between two boxes, with room for its "+". */
export const GAP = 48;
/** More on a line into a step with an "only if", for the pill. */
export const CONDITION_ROOM = 36;

/** How tall a box is before it is measured. */
export const GUESS: Record<LaneItem["kind"], number> = { trigger: 100, step: 100, instruction: 100, empty: 96, results: 52 };

export type Box = { x: number; y: number; width: number; height: number };

export type GapPlace = {
  /** Where the line starts (the box above's foot) and where its free part ends (before the next lane's name). */
  top: number;
  bottom: number;
  /** The centres of its "+" and of its "only if" pill, if it has one. */
  plusY: number;
  conditionY: number | null;
};

export type Placed = {
  boxes: Map<string, Box>;
  /** The lanes' names, by the key of the box they are above. */
  heads: Map<string, Box>;
  gaps: Map<string, GapPlace>;
  width: number;
  height: number;
};

/**
 * Places the diagram, centred on x = 0, from y = 0. `heights` are the boxes as measured, by key;
 * `conditioned` the keys of the steps whose line in has an "only if".
 */
export function laneLayout(diagram: Pick<LaneDiagram, "items" | "gaps" | "heads">, heights: ReadonlyMap<string, number> = new Map(), conditioned: ReadonlySet<string> = new Set()): Placed {
  const boxes = new Map<string, Box>();
  const heads = new Map<string, Box>();
  const gaps = new Map<string, GapPlace>();
  const headed = new Set(diagram.heads.map((head) => head.before));
  let y = 0;
  diagram.items.forEach((item, index) => {
    if (headed.has(item.key)) {
      heads.set(item.key, { x: -BOX_WIDTH / 2, y, width: BOX_WIDTH, height: HEAD_HEIGHT });
      y += HEAD_HEIGHT;
    }
    const width = item.kind === "results" ? RESULTS_WIDTH : BOX_WIDTH;
    const height = heights.get(item.key) ?? GUESS[item.kind];
    boxes.set(item.key, { x: -width / 2, y, width, height });
    y += height;
    const gap = diagram.gaps[index];
    if (!gap) return;
    const condition = conditioned.has(gap.to);
    const room = GAP + (condition ? CONDITION_ROOM : 0);
    gaps.set(gap.id, { top: y, bottom: y + room, plusY: condition ? y + 20 : y + GAP / 2, conditionY: condition ? y + 56 : null });
    y += room;
  });
  return { boxes, heads, gaps, width: BOX_WIDTH, height: y };
}

/** The gap or empty lane nearest a point of the canvas, among the places a dragged block can go. */
export function nearestZone(placed: Placed, zones: readonly { key: string }[], point: { x: number; y: number }): string | null {
  let best: { key: string; distance: number } | null = null;
  for (const zone of zones) {
    const gap = placed.gaps.get(zone.key);
    const box = placed.boxes.get(zone.key);
    const centre = gap ? (gap.top + gap.bottom) / 2 : box ? box.y + box.height / 2 : null;
    if (centre === null) continue;
    const distance = Math.abs(point.y - centre);
    if (!best || distance < best.distance) best = { key: zone.key, distance };
  }
  return best?.key ?? null;
}
