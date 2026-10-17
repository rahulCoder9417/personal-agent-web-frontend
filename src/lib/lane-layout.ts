// Where the boxes of an automation go on the canvas (`lane-canvas.tsx`): one column, top to bottom,
// in the order of `laneDiagram` (automation-lanes.ts), on an 8px grid, every box as wide as the
// others and centred on one line (x = 0). Between two boxes a line with room for its "+" in the
// middle; each lane's name sits at the foot of the line into its first box, to the side of the line.
//
// A step with an "only if" has a small condition box on the line into it: the line from the step
// before goes to the condition, "Yes" goes on down to the step, and "No" goes to a small Stop. On a
// wide board the Stop sits to the right of the condition; on a phone, or a board too narrow for that
// (`compact`), it sits under the condition, on the right of the column, so nothing goes past the
// column's width.
//
// A box is as tall as it is once drawn (React Flow measures it), rounded up to the grid; until then
// a guess by its kind. Nothing here draws.

import type { LaneDiagram, LaneItem } from "./automation-lanes";

/** The grid every box sits on. */
export const GRID = 8;
export const BOX_WIDTH = 320;
/** The results' box is as wide as the others. */
export const RESULTS_WIDTH = BOX_WIDTH;
/** The lane's name: a row at the foot of the line into its first box (and above the trigger). */
export const HEAD_HEIGHT = 24;
/** The line between two boxes, with its "+" in the middle and clear line above and below it. */
export const GAP = 72;
/** The line from a condition down to its step, with "Yes" in the middle. */
export const YES_GAP = 64;
/** On a phone the Stop sits beside that line, so it is longer. */
export const YES_GAP_COMPACT = 128;
/** How tall a condition is before it is measured, and its Stop. */
export const CONDITION_HEIGHT = 72;
export const STOP_HEIGHT = 40;
export const STOP_WIDTH = 128;
export const STOP_WIDTH_COMPACT = 104;
/** On a wide board: how far right of the column the Stop starts, and how far below the condition's middle its middle is. */
export const STOP_OFFSET_X = 56;
export const STOP_DROP = 56;
/** How wide a board must be for the Stop to sit beside the column: the drawing and 16px each side. */
export const SIDE_STOP_MIN_WIDTH = 16 + BOX_WIDTH + STOP_OFFSET_X + STOP_WIDTH + 16;
/** On a phone: where the "No" line leaves the condition (right of the centre line), and how far below the condition the Stop starts. */
export const NO_X_COMPACT = 104;
export const STOP_GAP_COMPACT = 72;

/** How tall a box is before it is measured. */
export const GUESS: Record<LaneItem["kind"], number> = { trigger: 104, step: 104, instruction: 104, empty: 104, results: 72 };

export type Box = { x: number; y: number; width: number; height: number };

export type GapPlace = {
  /** Where the line starts (the box above's foot) and where it meets the next box (or the condition). */
  top: number;
  bottom: number;
  /** The middle of the line: where its "+" is. */
  plusY: number;
  /** The middle of the condition on it, if it has one. */
  conditionY: number | null;
};

export type Placed = {
  boxes: Map<string, Box>;
  /** The lanes' names, by the key of the box they are above. */
  heads: Map<string, Box>;
  gaps: Map<string, GapPlace>;
  /** A conditioned step's condition and its Stop, by the step's key. */
  conditions: Map<string, Box>;
  stops: Map<string, Box>;
  /** How far the drawing goes left and right of the centre line, and how tall it is. */
  left: number;
  right: number;
  width: number;
  height: number;
};

export const conditionKey = (step: string) => `cond:${step}`;
export const stopKey = (step: string) => `stop:${step}`;

/** Up to the grid. */
const snap = (value: number) => Math.ceil(value / GRID) * GRID;

/**
 * Places the diagram, centred on x = 0, from y = 0. `heights` are the boxes as measured, by key
 * (a condition by `conditionKey`); `conditioned` the keys of the steps with an "only if" on the line
 * into them.
 */
export function laneLayout(
  diagram: Pick<LaneDiagram, "items" | "gaps" | "heads">,
  heights: ReadonlyMap<string, number> = new Map(),
  conditioned: ReadonlySet<string> = new Set(),
  { compact = false }: { compact?: boolean } = {},
): Placed {
  const boxes = new Map<string, Box>();
  const heads = new Map<string, Box>();
  const gaps = new Map<string, GapPlace>();
  const conditions = new Map<string, Box>();
  const stops = new Map<string, Box>();
  const headed = new Set(diagram.heads.map((head) => head.before));
  const column = (y: number, height: number): Box => ({ x: -BOX_WIDTH / 2, y, width: BOX_WIDTH, height });
  let right = BOX_WIDTH / 2;
  let y = 0;
  const first = diagram.items[0];
  if (first && headed.has(first.key)) {
    heads.set(first.key, column(0, HEAD_HEIGHT));
    y = HEAD_HEIGHT + GRID;
  }
  diagram.items.forEach((item, index) => {
    const height = snap(heights.get(item.key) ?? GUESS[item.kind]);
    boxes.set(item.key, column(y, height));
    y += height;
    const gap = diagram.gaps[index];
    if (!gap) return;
    const top = y;
    const bottom = y + GAP;
    if (headed.has(gap.to)) heads.set(gap.to, column(bottom - HEAD_HEIGHT, HEAD_HEIGHT));
    y = bottom;
    let conditionY: number | null = null;
    if (conditioned.has(gap.to)) {
      const condition = column(y, snap(heights.get(conditionKey(gap.to)) ?? CONDITION_HEIGHT));
      conditions.set(gap.to, condition);
      conditionY = condition.y + condition.height / 2;
      const foot = condition.y + condition.height;
      if (compact) {
        stops.set(gap.to, { x: NO_X_COMPACT - STOP_WIDTH_COMPACT / 2, y: foot + STOP_GAP_COMPACT, width: STOP_WIDTH_COMPACT, height: STOP_HEIGHT });
        y = foot + YES_GAP_COMPACT;
      } else {
        const stop = { x: BOX_WIDTH / 2 + STOP_OFFSET_X, y: conditionY + STOP_DROP - STOP_HEIGHT / 2, width: STOP_WIDTH, height: STOP_HEIGHT };
        stops.set(gap.to, stop);
        right = Math.max(right, stop.x + stop.width);
        y = foot + YES_GAP;
      }
    }
    gaps.set(gap.id, { top, bottom, plusY: top + GAP / 2, conditionY });
  });
  const left = -BOX_WIDTH / 2;
  return { boxes, heads, gaps, conditions, stops, left, right, width: right - left, height: y };
}

/** The gap or empty lane nearest a point of the canvas, among the places a dragged block can go. */
export function nearestZone(placed: Placed, zones: readonly { key: string }[], point: { x: number; y: number }): string | null {
  let best: { key: string; distance: number } | null = null;
  for (const zone of zones) {
    const gap = placed.gaps.get(zone.key);
    const box = placed.boxes.get(zone.key);
    const centre = gap ? gap.plusY : box ? box.y + box.height / 2 : null;
    if (centre === null) continue;
    const distance = Math.abs(point.y - centre);
    if (!best || distance < best.distance) best = { key: zone.key, distance };
  }
  return best?.key ?? null;
}
