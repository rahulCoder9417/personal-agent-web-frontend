// Where the boxes of an automation with steps go on the canvas: Trigger → Step 1 … Step N →
// Results, and beside each step with an "only if" a small grey exit, "otherwise: stop". dagre
// (`@dagrejs/dagre`, MIT, pinned at exactly 3.1.1) places the boxes, with room on each arrow for
// its label: left to right on a wide screen, top to bottom below 1,280 px. If dagre throws, the
// boxes go in a straight line and each exit beside its step, placed here.
//
// Only the canvas (`steps-canvas.tsx`, a chunk loaded on an automation's page and only from 768 px)
// imports this file, so dagre is never in another page's bundle, nor on a phone.

import dagre from "@dagrejs/dagre";
import type { FlowStep } from "./automation-flow";
import { EXIT_LABEL } from "./automation-steps";

export type Direction = "across" | "down";

export const BOX_WIDTH = 210;
export const BOX_HEIGHT = 148;
export const EXIT_WIDTH = 132;
export const EXIT_HEIGHT = 32;
/** Room between two boxes along the flow: enough for a condition's label and the "+" on the arrow. */
export const GAP_ALONG: Record<Direction, number> = { across: 116, down: 84 };
/** Room between a step and its exit. */
export const GAP_BESIDE = 40;

export type GraphNode = {
  id: string;
  kind: "box" | "exit";
  width: number;
  height: number;
  /** A box: the flow's box. */
  step?: FlowStep;
  /** A box: its place in the flow (0 is the trigger). */
  index?: number;
  /** An exit: the words on it. */
  label?: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  /** `next`: along the flow; `exit`: off it, to "otherwise: stop". */
  kind: "next" | "exit";
  /** The condition on an arrow into a step. */
  label: string | null;
  /** Where a step put on this arrow goes, as a place in the list of steps (0: first). Null on an exit. */
  insertAt: number | null;
};

export type StepGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

const exitId = (key: string) => `exit:${key}`;

/**
 * The boxes and arrows of a flow with steps (`automationFlow`: the trigger first, the results
 * last). Each arrow along the flow knows where a step put on it would go; a step with an "only if"
 * has its condition on the arrow into it and an exit off the box before it.
 */
export function stepGraph(items: readonly FlowStep[]): StepGraph {
  const nodes: GraphNode[] = items.map((step, index) => ({ id: step.key, kind: "box", width: BOX_WIDTH, height: BOX_HEIGHT, step, index }));
  const edges: GraphEdge[] = [];
  for (let i = 1; i < items.length; i++) {
    const from = items[i - 1];
    const to = items[i];
    // Between items i-1 and i: a new step goes before item i, which is step i (0-based) of the list.
    edges.push({ id: `${from.key}->${to.key}`, source: from.key, target: to.key, kind: "next", label: to.step?.condition ?? null, insertAt: i - 1 });
    if (to.step?.condition) {
      nodes.push({ id: exitId(to.key), kind: "exit", width: EXIT_WIDTH, height: EXIT_HEIGHT, label: EXIT_LABEL });
      edges.push({ id: `${from.key}->${exitId(to.key)}`, source: from.key, target: exitId(to.key), kind: "exit", label: null, insertAt: null });
    }
  }
  return { nodes, edges };
}

export type Placed = {
  /** Each node's top-left corner. */
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  /** Who placed them: dagre, or the straight line when dagre failed. */
  by: "dagre" | "line";
};

type LayoutFn = (graph: InstanceType<typeof dagre.graphlib.Graph>) => unknown;

/** The boxes in a straight line, each exit beside its step (off the line's side): dagre's stand-in. */
export function lineLayout(graph: StepGraph, direction: Direction): Placed {
  const positions = new Map<string, { x: number; y: number }>();
  const boxes = graph.nodes.filter((node) => node.kind === "box");
  const along = GAP_ALONG[direction];
  boxes.forEach((node, index) => {
    const offset = index * ((direction === "across" ? BOX_WIDTH : BOX_HEIGHT) + along);
    positions.set(node.id, direction === "across" ? { x: offset, y: 0 } : { x: 0, y: offset });
  });
  let hasExit = false;
  for (const node of graph.nodes) {
    if (node.kind !== "exit") continue;
    const step = positions.get(node.id.slice("exit:".length));
    if (!step) continue;
    hasExit = true;
    positions.set(
      node.id,
      direction === "across"
        ? { x: step.x + (BOX_WIDTH - EXIT_WIDTH) / 2, y: BOX_HEIGHT + GAP_BESIDE }
        : { x: BOX_WIDTH + GAP_BESIDE, y: step.y + (BOX_HEIGHT - EXIT_HEIGHT) / 2 },
    );
  }
  const count = boxes.length;
  const length = count * (direction === "across" ? BOX_WIDTH : BOX_HEIGHT) + Math.max(0, count - 1) * along;
  const side = hasExit ? GAP_BESIDE + (direction === "across" ? EXIT_HEIGHT : EXIT_WIDTH) : 0;
  return direction === "across"
    ? { positions, width: length, height: BOX_HEIGHT + side, by: "line" }
    : { positions, width: BOX_WIDTH + side, height: length, by: "line" };
}

/** Room a condition's label (and the "+" under it) takes on its arrow, for dagre to leave free. */
export const LABEL_WIDTH = 108;
export const LABEL_HEIGHT = 72;

/** An exit's place: beside its step, off the line (under it across, to its right down). */
function exitBeside(step: { x: number; y: number }, direction: Direction): { x: number; y: number } {
  return direction === "across"
    ? { x: step.x + (BOX_WIDTH - EXIT_WIDTH) / 2, y: step.y + BOX_HEIGHT + GAP_BESIDE }
    : { x: step.x + BOX_WIDTH + GAP_BESIDE, y: step.y + (BOX_HEIGHT - EXIT_HEIGHT) / 2 };
}

/**
 * Places the graph with dagre, left to right (`across`) or top to bottom (`down`). dagre places the
 * boxes along the flow, leaving room on each arrow for its condition's label; each exit then goes
 * beside its step, off the line, so the boxes stay in one straight line. Should dagre throw, the
 * straight line is placed here instead.
 */
export function layoutGraph(graph: StepGraph, direction: Direction, layout: LayoutFn = dagre.layout): Placed {
  try {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction === "across" ? "LR" : "TB", nodesep: GAP_BESIDE, ranksep: GAP_ALONG[direction] / 2, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    const boxes = graph.nodes.filter((node) => node.kind === "box");
    for (const node of boxes) g.setNode(node.id, { width: node.width, height: node.height });
    for (const edge of graph.edges) {
      if (edge.kind !== "next") continue;
      // Every arrow has the "+" while editing; one with a condition has its label too.
      const label = edge.label ? { width: LABEL_WIDTH, height: LABEL_HEIGHT } : { width: 28, height: 28 };
      g.setEdge(edge.source, edge.target, { ...label, labelpos: "c", minlen: 1 });
    }
    layout(g);
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of boxes) {
      const placed = g.node(node.id) as { x?: number; y?: number } | undefined;
      if (!placed || !Number.isFinite(placed.x) || !Number.isFinite(placed.y)) throw new Error(`dagre left ${node.id} unplaced`);
      positions.set(node.id, { x: placed.x! - node.width / 2, y: placed.y! - node.height / 2 });
    }
    for (const node of graph.nodes) {
      if (node.kind !== "exit") continue;
      const step = positions.get(node.id.slice("exit:".length));
      if (step) positions.set(node.id, exitBeside(step, direction));
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
      const at = positions.get(node.id);
      if (!at) continue;
      minX = Math.min(minX, at.x);
      minY = Math.min(minY, at.y);
      maxX = Math.max(maxX, at.x + node.width);
      maxY = Math.max(maxY, at.y + node.height);
    }
    // From the top-left corner, so both layouts start at 0.
    for (const [id, at] of positions) positions.set(id, { x: at.x - minX, y: at.y - minY });
    return { positions, width: maxX - minX, height: maxY - minY, by: "dagre" };
  } catch {
    return lineLayout(graph, direction);
  }
}
