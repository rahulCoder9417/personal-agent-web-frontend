"use client";

// The automation's canvas, drawn with React Flow as a graph: a light dotted board to pan and zoom,
// with its zoom buttons (bottom right), and the boxes in one column on one centre line, top to bottom
// (`laneDiagram`, placed on an 8px grid by `laneLayout`): the trigger, the reads, Tex and the crew,
// the writes, the results. Each box is a soft tint of its kind's colour with a 1px edge of it
// (trigger green, read blue, "only if" amber, Tex purple, write teal, the end grey), its mark on a
// tile of that colour, its name, a line, and its key settings as read-only chips. Small round
// ports sit on the boxes' edges where the lines meet them; each line ends in an arrowhead at the
// port, and carries a "+" in its middle to put a step there. Each lane's name sits at the foot of
// the line into its first box, beside the line.
//
// A step with an "only if" has a small amber condition box on the line into it (drawn from the
// step's own condition: nothing branches in the steps themselves): "Yes" goes on to the step, "No"
// curves off to a small grey Stop. The condition and the Stop open the step's settings. An empty
// lane is a dashed box that takes its first step.
//
// A block dragged from the palette (HTML5 drag and drop) lights up only the places of its own lane
// (`dropZones`); the nearest to the pointer, found with `screenToFlowPosition`, is where it goes. A
// trigger block goes on the trigger. On a phone the canvas is a still picture, as tall as the flow,
// that scrolls with the page; adding works by click.
//
// This file only draws what the builder gives it. It is its own chunk, loaded with next/dynamic.

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ControlButton,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import { dropZones, type Insert, type Lane, type LaneDiagram, type LaneItem } from "@/lib/automation-lanes";
import { MAX_STEPS } from "@/lib/automation-steps";
import { cn } from "@/lib/format";
import { BOX_WIDTH, conditionKey, laneLayout, nearestZone, NO_X_COMPACT, SIDE_STOP_MIN_WIDTH, STOP_WIDTH, STOP_WIDTH_COMPACT, stopKey, type Box } from "@/lib/lane-layout";
import { CloseIcon, LockIcon, MinusIcon, PlusIcon, WarningIcon } from "../icons";
import { NodeTile, type NodeKind } from "./kind-icon";
import { T2, T3, type ChipTone } from "./parts";

// ---------------------------------------------------------------- what the builder gives

export type BoxChip = { text: string; tone?: ChipTone; mono?: boolean; lock?: boolean; title?: string };

export type CanvasBox = {
  key: string;
  logo: string;
  iconUrl?: string | null;
  /** What it is, for a screen reader: "Step 2 · Gmail", "Schedule". */
  label: string;
  title: string;
  /** The muted line under its name. */
  line?: string | null;
  /** Its key settings, read-only ("List pull requests", "is:pr is:open"), and how it stands ("Connect Gmail"). */
  chips?: BoxChip[];
  /** Something to fix on it, in amber. */
  problem?: string | null;
  /** Its × removes it (shown on hover, and when it is open). */
  removable?: boolean;
  dim?: boolean;
};

/** An empty lane's box: what skipping it means, and the way to add one. */
export type CanvasEmpty = { key: string; lane: Lane; title: string; line: string; action: string };

export type CanvasHead = { before: string; text: string; skip?: string };

/** A step's "only if": its condition box's name and line, the whole sentence, and whether it looks at another step now. */
export type CanvasCondition = { text: string; title: string; line: string; warn: boolean };

export type LaneCanvasProps = {
  diagram: LaneDiagram;
  boxes: ReadonlyMap<string, CanvasBox>;
  empties: ReadonlyMap<string, CanvasEmpty>;
  /** The results' box: where they go, and a line. */
  results: { title: string; line: string };
  heads: readonly CanvasHead[];
  /** The "only if" on the line into a step, by the step's key. */
  conditions: ReadonlyMap<string, CanvasCondition>;
  selected: string | null;
  /** How many steps there are: at 6 nothing more goes in. */
  count: number;
  /** Changes can be made: the "+", the ×, skipping, dropping. */
  editing: boolean;
  /** A phone: a still picture as tall as the flow. */
  compact: boolean;
  /** A block being dragged from the palette: its group. */
  dragging: Lane | "start" | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onSkip: (lane: "read" | "write") => void;
  /** "+" on a line, or an empty lane's "Add a … step": the places a block can go there. */
  onPlus: (inserts: Insert[]) => void;
  onDrop: (insert: Insert) => void;
  onDropTrigger: () => void;
  label: string;
};

// ---------------------------------------------------------------- the ports

/** Where a line meets a box: its port's id, its side, and (on a phone) how far right of the middle it is. */
type Port = { id: string; type: "source" | "target"; side: Position; offset?: number };

const PORT = 10;

/**
 * The ports, as React Flow's handles: small round dots centred on the box's outline (React Flow
 * centres a handle on its side; the box's edge is drawn inside it, so the dot sits on it exactly).
 */
function Ports({ ports }: { ports: readonly Port[] }) {
  return (
    <>
      {ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.type}
          position={port.side}
          isConnectable={false}
          className="graph-port"
          style={port.offset ? ({ left: `calc(50% + ${port.offset}px)` } satisfies CSSProperties) : undefined}
        />
      ))}
    </>
  );
}

/** Where each port is on a box of this size, so the lines are drawn from the first paint, before React Flow finds them. */
function portBounds(ports: readonly Port[], width: number, height: number) {
  const half = PORT / 2;
  return ports.map((port) => {
    const at =
      port.side === Position.Top
        ? { x: width / 2 - half, y: -half }
        : port.side === Position.Bottom
          ? { x: width / 2 + (port.offset ?? 0) - half, y: height - half }
          : port.side === Position.Right
            ? { x: width - half, y: height / 2 - half }
            : { x: -half, y: height / 2 - half };
    return { id: port.id, type: port.type, position: port.side, ...at, width: PORT, height: PORT };
  });
}

const IN: Port = { id: "in", type: "target", side: Position.Top };
const OUT: Port = { id: "out", type: "source", side: Position.Bottom };

// ---------------------------------------------------------------- the nodes

type Shared = {
  kind: NodeKind;
  ports: readonly Port[];
  selected: boolean;
  editing: boolean;
  over: boolean;
  zone: "on" | "off" | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
};
type BoxData = Shared & { box: CanvasBox };
type EmptyData = Shared & { empty: CanvasEmpty; onAdd: () => void };
type ResultsData = Shared & { title: string; line: string };
type ConditionData = Shared & { step: string; condition: CanvasCondition };
type StopData = Shared & { step: string; compact: boolean };
type HeadData = { head: CanvasHead; onSkip: (lane: "read" | "write") => void; editing: boolean; lane: Lane | "start" | "steps" };

/** Click, Enter or Space opens the box's settings. */
function pressable(select: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: select,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    },
  } as const;
}

const CHIP: Record<ChipTone, string> = {
  // A setting, read-only: white, with a quiet edge.
  neutral: "bg-surface text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)]",
  ok: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn shadow-[inset_0_0_0_1px_var(--warn-line)]",
  danger: "bg-danger-soft text-danger",
  blue: "bg-accent-soft text-accent-dark",
};

function NodeChip({ chip }: { chip: BoxChip }) {
  return (
    <span
      title={chip.title ?? chip.text}
      className={cn("inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md px-2 text-[12px] leading-4 font-medium", CHIP[chip.tone ?? "neutral"], chip.mono && "font-mono")}
    >
      {chip.lock && <LockIcon size={12} strokeWidth={2.2} className="shrink-0" />}
      <span className="truncate">{chip.text}</span>
    </span>
  );
}

/**
 * The top of every box: its tile, its name in bold (on two lines at most) and its line, muted, on
 * one. 40px high, or 56 with a name on two lines: on the grid either way.
 */
function NodeHead({ kind, logo, iconUrl, title, line, dim, room }: { kind: NodeKind; logo: string; iconUrl?: string | null; title: string; line?: string | null; dim?: boolean; room?: boolean }) {
  return (
    <span className={cn("flex min-h-10 min-w-0 items-center gap-3", room && "pr-8")}>
      <NodeTile kind={kind} logo={logo} iconUrl={iconUrl} size={36} className={cn(dim && "opacity-50")} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn(T2, "line-clamp-2 font-semibold break-words", dim ? "text-muted" : "text-fg")}>{title}</span>
        {line && <span className={cn(T3, "truncate text-muted")}>{line}</span>}
      </span>
    </span>
  );
}

// React Flow gives a node `pointer-events: none` when it is not selectable, draggable or given
// onNodeClick, which is how this board is set; each node says `pointer-events-auto` so its own
// click (and its buttons) work.
const NODE = "graph-node pointer-events-auto group relative flex cursor-pointer flex-col gap-2 rounded-2xl p-4 text-left outline-none";
const DROP_OVER = "!shadow-[0_0_0_2px_var(--accent),0_0_0_6px_var(--accent-soft)]";

function BoxNode({ data }: NodeProps<Node<BoxData, "box">>) {
  const { box, kind, ports, selected, editing, onSelect, onRemove, over, zone } = data;
  const removable = editing && box.removable;
  return (
    <div
      {...pressable(() => onSelect(box.key))}
      aria-pressed={selected}
      aria-label={`${box.label}: ${box.title}.${box.problem ? ` To fix: ${box.problem}` : ""}`}
      data-kind={kind}
      data-problem={box.problem ? "true" : undefined}
      style={{ width: BOX_WIDTH }}
      className={cn(NODE, over && DROP_OVER, zone === "off" && "opacity-40")}
    >
      <Ports ports={ports} />
      <NodeHead kind={kind} logo={box.logo} iconUrl={box.iconUrl} title={box.title} line={box.line} dim={box.dim} room={removable} />
      {box.problem && (
        <span className={cn(T3, "flex items-start gap-1 font-medium text-warn")}>
          <span className="flex h-4 shrink-0 items-center">
            <WarningIcon size={12} />
          </span>
          <span className="line-clamp-2 break-words">{box.problem}</span>
        </span>
      )}
      {box.chips && box.chips.length > 0 && (
        <span className="flex flex-wrap gap-2">
          {box.chips.map((chip) => (
            <NodeChip key={chip.text} chip={chip} />
          ))}
        </span>
      )}
      {removable && (
        <button
          type="button"
          aria-label={`Remove ${box.title}`}
          title="Remove step"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(box.key);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className={cn(
            "nodrag absolute top-5 right-3 grid size-8 place-items-center rounded-lg text-muted transition-[opacity,color,background-color] hover:bg-surface hover:text-fg focus-visible:opacity-100",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <CloseIcon size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function EmptyNode({ data }: NodeProps<Node<EmptyData, "empty">>) {
  const { empty, kind, ports, editing, onAdd, over, zone } = data;
  return (
    <div
      data-kind={kind}
      style={{ width: BOX_WIDTH }}
      className={cn(
        // The dashed edge is an outline drawn inside the box, so the ports sit on it as on any box.
        "empty-node pointer-events-auto relative flex flex-col items-center gap-2 rounded-2xl p-4 text-center outline-[1.5px] -outline-offset-[1.5px] outline-dashed transition-colors",
        zone === "on"
          ? over
            ? "bg-[#dfe5ff] shadow-[0_0_0_4px_var(--accent-soft)] outline-accent"
            : "bg-accent-soft outline-accent"
          : "bg-surface/60 outline-[color-mix(in_srgb,var(--k)_45%,var(--surface))]",
        zone === "off" && "opacity-40",
      )}
    >
      <Ports ports={ports} />
      <span className={cn(T3, "font-semibold text-fg-2")}>{empty.title}</span>
      <span className={cn(T3, "text-muted")}>{empty.line}</span>
      {editing && (
        <button type="button" onClick={onAdd} className={cn(T3, "nodrag font-semibold text-accent-dark hover:text-fg")}>
          {empty.action}
        </button>
      )}
    </div>
  );
}

function ResultsNode({ data }: NodeProps<Node<ResultsData, "results">>) {
  const { selected, onSelect, title, line, kind, ports } = data;
  return (
    <div {...pressable(() => onSelect("results"))} aria-pressed={selected} aria-label={`Results: ${title}. ${line}`} data-kind={kind} style={{ width: BOX_WIDTH }} className={NODE}>
      <Ports ports={ports} />
      <NodeHead kind={kind} logo="chat" title={title} line={line} />
    </div>
  );
}

function ConditionNode({ data }: NodeProps<Node<ConditionData, "condition">>) {
  const { condition, step, kind, ports, onSelect, zone } = data;
  return (
    <div
      {...pressable(() => onSelect(step))}
      aria-label={`${condition.text}. Otherwise the run stops there. Opens the step’s settings.`}
      data-kind={kind}
      data-problem={condition.warn ? "true" : undefined}
      style={{ width: BOX_WIDTH }}
      className={cn(NODE, zone === "off" && "opacity-40")}
    >
      <Ports ports={ports} />
      <NodeHead kind={kind} logo="cond" title={condition.title} line={condition.warn ? "Check it: the step before it changed" : condition.line} />
    </div>
  );
}

function StopNode({ data }: NodeProps<Node<StopData, "stop">>) {
  const { step, kind, ports, onSelect, compact, zone } = data;
  return (
    <div
      {...pressable(() => onSelect(step))}
      aria-label="Stop: when the condition is false, the run stops here and nothing after it runs."
      data-kind={kind}
      style={{ width: compact ? STOP_WIDTH_COMPACT : STOP_WIDTH }}
      className={cn("graph-node pointer-events-auto relative flex h-10 cursor-pointer items-center gap-2 rounded-xl px-2 text-left outline-none", zone === "off" && "opacity-40")}
    >
      <Ports ports={ports} />
      <NodeTile kind={kind} logo="stop" size={24} />
      <span className="flex min-w-0 flex-col">
        <span className={cn(T3, "font-semibold text-fg")}>Stop</span>
        {!compact && <span className={cn(T3, "truncate text-muted")}>Skips the rest</span>}
      </span>
    </div>
  );
}

function HeadNode({ data }: NodeProps<Node<HeadData, "head">>) {
  const { head, editing, onSkip, lane } = data;
  // The line runs down the middle of the row: the lane's name keeps to the left of it, "Skip" to the right.
  return (
    <div style={{ width: BOX_WIDTH }} className="flex h-6 items-center justify-between px-1">
      <span className={cn(T3, "max-w-[calc(50%-20px)] truncate font-semibold tracking-[0.04em] text-muted uppercase")}>{head.text}</span>
      {editing && head.skip && (lane === "read" || lane === "write") && (
        <button type="button" onClick={() => onSkip(lane)} className={cn(T3, "nodrag pointer-events-auto max-w-[calc(50%-20px)] truncate font-medium text-accent-dark hover:text-fg")}>
          {head.skip}
        </button>
      )}
    </div>
  );
}

const NODE_TYPES = { box: BoxNode, empty: EmptyNode, results: ResultsNode, condition: ConditionNode, stop: StopNode, head: HeadNode };

// ---------------------------------------------------------------- the lines

type LinkData = {
  /** A line between two boxes (with its "+"), or a condition's "Yes" or "No". */
  variant: "line" | "yes" | "no";
  inserts: Insert[];
  editing: boolean;
  canAdd: boolean;
  zone: "on" | "off" | null;
  over: boolean;
  onPlus: (inserts: Insert[]) => void;
};

const STROKE: Record<LinkData["variant"], string> = { line: "var(--edge)", yes: "var(--node-trigger)", no: "var(--edge-no)" };

/** The arrowhead at the end of a line, into the port it points at (from above, or from the left). */
function arrowHead(x: number, y: number, side: Position): string {
  return side === Position.Left ? `M ${x - 6} ${y - 5} L ${x} ${y} L ${x - 6} ${y + 5}` : `M ${x - 5} ${y - 6} L ${x} ${y} L ${x + 5} ${y - 6}`;
}

/** "Yes" or "No" on a condition's line: a small pill, drawn in the line itself. */
function Verdict({ x, y, yes }: { x: number; y: number; yes: boolean }) {
  const width = yes ? 40 : 36;
  return (
    <g transform={`translate(${x} ${y})`} className="pointer-events-none" aria-hidden>
      <rect
        x={-width / 2}
        y={-12}
        width={width}
        height={24}
        rx={12}
        fill={yes ? "var(--success-soft)" : "var(--danger-soft)"}
        stroke={yes ? "var(--node-trigger)" : "var(--edge-no)"}
        strokeWidth={1}
      />
      <text textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill={yes ? "var(--success)" : "var(--danger)"}>
        {yes ? "Yes" : "No"}
      </text>
    </g>
  );
}

function LinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<LinkData, "link">>) {
  const variant = data?.variant ?? "line";
  // Down the centre line it is straight; the "No" to a Stop at the side is a smooth curve.
  const straight = sourceX === targetX && sourcePosition === Position.Bottom && targetPosition === Position.Top;
  const [path, labelX, labelY] = straight
    ? getStraightPath({ sourceX, sourceY, targetX, targetY })
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const stroke = STROKE[variant];
  const faded = data?.zone === "off";
  const showPlus = variant === "line" && data && data.editing && data.inserts.length > 0 && data.zone === null;
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke, strokeWidth: 2, opacity: faded ? 0.35 : 1 }} />
      <path d={arrowHead(targetX, targetY, targetPosition)} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={faded ? 0.35 : 1} className="graph-arrow" />
      {variant !== "line" && <Verdict x={labelX} y={labelY} yes={variant === "yes"} />}
      {variant === "line" && data && (
        <EdgeLabelRenderer>
          {data.zone === "on" && (
            <div
              style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, width: BOX_WIDTH - 40 }}
              className={cn(
                T3,
                "nodrag nopan pointer-events-none absolute flex h-8 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent font-semibold text-accent-dark",
                data.over ? "bg-[#dfe5ff]" : "bg-accent-soft",
              )}
            >
              <PlusIcon size={14} strokeWidth={2.6} />
              Drop here
            </div>
          )}
          {showPlus && (
            <button
              type="button"
              disabled={!data.canAdd}
              onClick={() => data.onPlus(data.inserts)}
              title={data.canAdd ? "Add a step here" : "An automation has up to 6 steps"}
              aria-label={data.canAdd ? "Add a step here" : "Up to 6 steps"}
              style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
              className="nodrag nopan absolute grid size-6 place-items-center rounded-full bg-surface text-muted shadow-[inset_0_0_0_1.5px_var(--line-strong)] transition-colors hover:bg-accent-soft hover:text-accent-dark hover:shadow-[inset_0_0_0_1.5px_var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PlusIcon size={12} strokeWidth={2.8} />
            </button>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const EDGE_TYPES = { link: LinkEdge };

// ---------------------------------------------------------------- the board

function Zoom() {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Controls showZoom={false} showFitView={false} showInteractive={false} orientation="horizontal" position="bottom-right" aria-label="Zoom">
      <ControlButton onClick={() => void flow.zoomOut()} aria-label="Zoom out" title="Zoom out">
        <MinusIcon size={14} strokeWidth={2.2} />
      </ControlButton>
      <span className={cn(T3, "grid min-w-11 place-items-center text-fg-2 tabular-nums")} aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <ControlButton onClick={() => void flow.zoomIn()} aria-label="Zoom in" title="Zoom in">
        <PlusIcon size={14} strokeWidth={2.2} />
      </ControlButton>
      <ControlButton onClick={() => void flow.fitView({ padding: 0.12, maxZoom: 1 })} aria-label="Fit to screen" title="Fit to screen">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </ControlButton>
    </Controls>
  );
}

/** A box's colour: what it is in the diagram. */
function kindOf(item: LaneItem): NodeKind {
  if (item.kind === "trigger") return "trigger";
  if (item.kind === "results") return "end";
  if (item.kind === "instruction") return "tex";
  return item.lane;
}

/**
 * The board. React Flow keeps its own store, made from the nodes it is first given, so the boxes
 * are drawn from the first paint (and on the server); its instance comes with `onInit`.
 */
export default function LaneCanvas(props: LaneCanvasProps) {
  const { diagram, boxes, empties, results, heads, conditions, selected, count, editing, compact, dragging, onSelect, onRemove, onSkip, onPlus, onDrop, onDropTrigger, label } = props;
  const flow = useRef<ReactFlowInstance | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // Each box's size as React Flow measured it. Given back on its node (`measured`), so React Flow
  // keeps it, and the layout makes room for it.
  const [sizes, setSizes] = useState<Map<string, { width: number; height: number }>>(() => new Map());
  const heights = useMemo(() => new Map([...sizes].map(([id, size]) => [id, size.height])), [sizes]);
  const [over, setOver] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const conditioned = useMemo(() => new Set(conditions.keys()), [conditions]);
  // A condition's Stop sits beside the column where the board is wide enough, else under the condition.
  const stacked = compact || (width > 0 && width < SIDE_STOP_MIN_WIDTH);
  const placed = useMemo(() => laneLayout(diagram, heights, conditioned, { compact: stacked }), [diagram, heights, conditioned, stacked]);
  const stepLane = dragging && dragging !== "start" ? dragging : null;
  const zones = useMemo(() => (stepLane ? dropZones(diagram, stepLane, count) : []), [diagram, stepLane, count]);
  const zoneKeys = useMemo(() => new Set(zones.map((zone) => zone.key)), [zones]);
  const zoneOf = useCallback((key: string): "on" | "off" | null => (dragging ? (zoneKeys.has(key) || (dragging === "start" && key === "trigger") ? "on" : "off") : null), [dragging, zoneKeys]);

  // On a phone the drawing fits the width; on a wide screen it is at 100%, centred, its top near the top.
  const zoom = compact && width ? Math.min(1, (width - 32) / placed.width) : 1;
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Placed once React Flow is ready and the board's width is known, whichever comes last; on a
  // phone again whenever the width changes (it doesn't pan there). The drawing (with any Stop at
  // the side) is centred, but its column never starts closer than 16px to the left edge.
  const [ready, setReady] = useState(false);
  const placedOnce = useRef(false);
  const centre = (placed.left + placed.right) / 2;
  useEffect(() => {
    if (!ready || !width || !flow.current) return;
    if (compact || !placedOnce.current) {
      placedOnce.current = true;
      const x = Math.round(Math.max(width / 2 - centre * zoom, 16 - placed.left * zoom));
      void flow.current.setViewport({ x, y: compact ? 16 : 32, zoom });
    }
  }, [ready, width, compact, zoom, centre, placed.left]);

  const shared = (key: string, kind: NodeKind, ports: readonly Port[]): Shared => ({
    kind,
    ports,
    selected: selected === key,
    editing,
    over: over === key,
    zone: zoneOf(key),
    onSelect,
    onRemove,
  });
  const fixed = { draggable: false, selectable: false, connectable: false, focusable: false } as const;
  /**
   * A node at its place: its size before it is measured, so it is drawn from the first paint (and
   * on the server), its size once measured, and where its ports are, so the lines are drawn
   * without waiting for React Flow to find them.
   */
  const at = (id: string, box: Box, ports: readonly Port[]) => ({
    id,
    position: { x: box.x, y: box.y },
    initialWidth: box.width,
    initialHeight: box.height,
    ...(sizes.get(id) ? { measured: sizes.get(id) } : {}),
    handles: portBounds(ports, box.width, sizes.get(id)?.height ?? box.height),
    ...fixed,
  });

  const nodes: Node[] = [];
  const last = diagram.items.length - 1;
  diagram.items.forEach((item, index) => {
    const box = placed.boxes.get(item.key)!;
    const kind = kindOf(item);
    const ports = [...(index > 0 ? [IN] : []), ...(index < last ? [OUT] : [])];
    if (item.kind === "results") nodes.push({ ...at(item.key, box, ports), type: "results", data: { ...shared(item.key, kind, ports), ...results } });
    else if (item.kind === "empty") {
      const empty = empties.get(item.key);
      if (empty) nodes.push({ ...at(item.key, box, ports), type: "empty", data: { ...shared(item.key, kind, ports), empty, onAdd: () => onPlus(zonesFor(diagram, item.lane, count)) } });
    } else {
      const content = boxes.get(item.key);
      if (content) nodes.push({ ...at(item.key, box, ports), type: "box", data: { ...shared(item.key, kind, ports), box: content } });
    }
  });
  const noPort: Port = stacked ? { id: "no", type: "source", side: Position.Bottom, offset: NO_X_COMPACT } : { id: "no", type: "source", side: Position.Right };
  const stopIn: Port = stacked ? IN : { id: "in", type: "target", side: Position.Left };
  for (const [step, condition] of conditions) {
    const box = placed.conditions.get(step);
    const stop = placed.stops.get(step);
    if (!box || !stop) continue;
    const ports = [IN, { id: "yes", type: "source", side: Position.Bottom } as Port, noPort];
    nodes.push({ ...at(conditionKey(step), box, ports), type: "condition", data: { ...shared(conditionKey(step), "cond", ports), step, condition } });
    nodes.push({ ...at(stopKey(step), stop, [stopIn]), type: "stop", data: { ...shared(stopKey(step), "end", [stopIn]), step, compact: stacked } });
  }
  for (const head of heads) {
    const box = placed.heads.get(head.before);
    const lane = diagram.heads.find((item) => item.before === head.before)?.lane ?? "start";
    if (box) nodes.push({ ...at(`head:${head.before}`, box, []), type: "head", data: { head, onSkip, editing, lane } });
  }

  const lineData = (variant: LinkData["variant"], gap: (typeof diagram.gaps)[number] | null): LinkData => ({
    variant,
    inserts: gap?.inserts ?? [],
    editing,
    canAdd: count < MAX_STEPS,
    zone: dragging ? (gap && zoneKeys.has(gap.id) ? "on" : "off") : null,
    over: gap ? over === gap.id : false,
    onPlus,
  });
  const edge = (id: string, source: string, sourceHandle: string, target: string, data: LinkData): Edge => ({
    id,
    source,
    sourceHandle,
    target,
    targetHandle: "in",
    type: "link",
    selectable: false,
    focusable: false,
    data,
  });
  const edges: Edge[] = [];
  for (const gap of diagram.gaps) {
    if (!placed.conditions.has(gap.to)) {
      edges.push(edge(gap.id, gap.from, "out", gap.to, lineData("line", gap)));
      continue;
    }
    // Into a step with an "only if": the line from the step before goes to its condition, "Yes"
    // goes on to the step, "No" to the Stop. A step put on this line goes before the condition.
    edges.push(edge(gap.id, gap.from, "out", conditionKey(gap.to), lineData("line", gap)));
    edges.push(edge(`${gap.id}:yes`, conditionKey(gap.to), "yes", gap.to, lineData("yes", null)));
    edges.push(edge(`${gap.id}:no`, conditionKey(gap.to), "no", stopKey(gap.to), lineData("no", null)));
  }

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setSizes((current) => {
      let next: Map<string, { width: number; height: number }> | null = null;
      for (const change of changes) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const was = current.get(change.id);
        if (was && was.width === change.dimensions.width && was.height === change.dimensions.height) continue;
        next ??= new Map(current);
        next.set(change.id, { width: change.dimensions.width, height: change.dimensions.height });
      }
      return next ?? current;
    });
  }, []);

  const point = (event: DragEvent) => flow.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 };
  const onDragOver = (event: DragEvent) => {
    if (!dragging || !editing) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const next = dragging === "start" ? "trigger" : nearestZone(placed, zones, point(event));
    if (next !== over) setOver(next);
  };
  const onDropHere = (event: DragEvent) => {
    if (!dragging || !editing) return;
    event.preventDefault();
    setOver(null);
    if (dragging === "start") return onDropTrigger();
    const key = nearestZone(placed, zones, point(event));
    const zone = zones.find((item) => item.key === key);
    if (zone) onDrop(zone.insert);
  };

  const height = compact ? Math.ceil(placed.height * zoom) + 48 : undefined;
  return (
    <div
      ref={wrap}
      className={cn("automation-canvas relative h-full w-full", compact && "h-auto")}
      style={height ? { height } : undefined}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setOver(null);
      }}
      onDrop={onDropHere}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onInit={(instance) => {
          flow.current = instance;
          setReady(true);
        }}
        defaultViewport={{ x: 0, y: 32, zoom: 1 }}
        minZoom={0.4}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={!compact}
        panOnScroll={!compact}
        zoomOnScroll={false}
        zoomOnPinch={!compact}
        zoomOnDoubleClick={false}
        preventScrolling={!compact}
        aria-label={label}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.3} color="#d2cdc2" />
        {!compact && <Zoom />}
      </ReactFlow>
    </div>
  );
}

/** The places an empty lane's "Add a … step" offers: its own box. */
function zonesFor(diagram: LaneDiagram, lane: Lane, count: number): Insert[] {
  return dropZones(diagram, lane, count)
    .filter((zone) => zone.key === `empty:${lane}`)
    .map((zone) => zone.insert);
}
