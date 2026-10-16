"use client";

// The automation's canvas, drawn with React Flow: a dotted board to pan and zoom, with its zoom
// buttons, and the boxes in one column, top to bottom (`laneDiagram`, placed by `laneLayout`): the
// trigger, the reads, Tex and the crew, the writes, the results, each lane named above its first
// box. A line between two boxes carries a "+" to put a step there and, into a step with an "only
// if", its pill. An empty lane is a dashed box that takes its first step.
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
  getStraightPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { dropZones, type Insert, type Lane, type LaneDiagram } from "@/lib/automation-lanes";
import { MAX_STEPS } from "@/lib/automation-steps";
import { cn } from "@/lib/format";
import { BOX_WIDTH, laneLayout, nearestZone, RESULTS_WIDTH } from "@/lib/lane-layout";
import { CloseIcon, LockIcon, MinusIcon, PlusIcon, WarningIcon } from "../icons";
import { AppLogo, Chip, T2, T3, type ChipTone } from "./parts";

// ---------------------------------------------------------------- what the builder gives

export type BoxChip = { text: string; tone?: ChipTone; mono?: boolean; lock?: boolean };

export type CanvasBox = {
  key: string;
  logo: string;
  iconUrl?: string | null;
  /** Small, above the title: "Step 2 · Gmail", "Schedule". */
  label: string;
  title: string;
  line?: string | null;
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

export type CanvasCondition = { text: string; warn: boolean };

export type LaneCanvasProps = {
  diagram: LaneDiagram;
  boxes: ReadonlyMap<string, CanvasBox>;
  empties: ReadonlyMap<string, CanvasEmpty>;
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

// ---------------------------------------------------------------- the nodes

type Shared = {
  selected: boolean;
  editing: boolean;
  over: boolean;
  zone: "on" | "off" | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
};
type BoxData = Shared & { box: CanvasBox; trigger: boolean };
type EmptyData = Shared & { empty: CanvasEmpty; onAdd: () => void };
type ResultsData = Shared & { title: string; line: string };
type HeadData = { head: CanvasHead; onSkip: (lane: "read" | "write") => void; editing: boolean; lane: Lane | "start" | "steps" };

const HIDDEN = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function Ends() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} className={HIDDEN} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} className={HIDDEN} />
    </>
  );
}

function BoxNode({ data }: NodeProps<Node<BoxData, "box">>) {
  const { box, selected, editing, onSelect, onRemove, over, zone } = data;
  const select = () => onSelect(box.key);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${box.label}: ${box.title}.${box.problem ? ` To fix: ${box.problem}` : ""}`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      style={{ width: BOX_WIDTH }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-3 rounded-[14px] bg-surface p-4 text-left outline-none transition-shadow",
        selected
          ? "shadow-[0_0_0_2px_var(--accent),0_12px_28px_-14px_rgb(21_21_21/0.35)]"
          : box.problem
            ? "shadow-[0_0_0_1.5px_var(--warn-dot),0_1px_2px_rgb(21_21_21/0.05)]"
            : "shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(21_21_21/0.05)] hover:shadow-[0_0_0_1px_#c3bdb1,0_4px_12px_-6px_rgb(21_21_21/0.15)]",
        "focus-visible:shadow-[0_0_0_2px_var(--accent)]",
        over && "shadow-[0_0_0_2px_var(--accent),0_0_0_6px_var(--accent-soft)]",
        zone === "off" && "opacity-40",
      )}
    >
      <Ends />
      <span className="flex items-center gap-3 pr-6">
        <span className={cn(box.dim && "opacity-50")}>
          <AppLogo slug={box.logo} size={36} iconUrl={box.iconUrl} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn(T3, "truncate text-muted")}>{box.label}</span>
          <span className={cn(T2, "line-clamp-2 font-semibold break-words", box.dim ? "text-muted" : "text-fg")}>{box.title}</span>
        </span>
      </span>
      {box.line && <span className={cn(T3, "line-clamp-2 break-words text-fg-2")}>{box.line}</span>}
      {box.problem && (
        <span className={cn(T3, "flex items-start gap-1 font-medium text-warn")}>
          <WarningIcon size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2 break-words">{box.problem}</span>
        </span>
      )}
      {box.chips && box.chips.length > 0 && (
        <span className="flex flex-wrap gap-2">
          {box.chips.map((chip) => (
            <Chip key={chip.text} tone={chip.tone} mono={chip.mono}>
              {chip.lock && <LockIcon size={12} strokeWidth={2.2} />}
              <span className="truncate">{chip.text}</span>
            </Chip>
          ))}
        </span>
      )}
      {editing && box.removable && (
        <button
          type="button"
          aria-label={`Remove ${box.title}`}
          title="Remove step"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(box.key);
          }}
          className={cn(
            "nodrag absolute top-2 right-2 grid size-8 place-items-center rounded-lg text-muted transition-[opacity,color,background-color] hover:bg-surface-2 hover:text-fg focus-visible:opacity-100",
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
  const { empty, editing, onAdd, over, zone } = data;
  return (
    <div
      style={{ width: BOX_WIDTH }}
      className={cn(
        "flex flex-col items-center gap-1 rounded-[14px] border-[1.5px] border-dashed bg-surface/60 p-4 text-center transition-colors",
        zone === "on" ? (over ? "border-accent bg-[#dfe5ff] shadow-[0_0_0_4px_var(--accent-soft)]" : "border-accent bg-accent-soft") : "border-line-strong",
        zone === "off" && "opacity-40",
      )}
    >
      <Ends />
      <span className={cn(T3, "font-semibold text-fg-2")}>{empty.title}</span>
      <span className={cn(T3, "text-muted")}>{empty.line}</span>
      {editing && (
        <button type="button" onClick={onAdd} className={cn(T3, "nodrag pt-1 font-semibold text-accent-dark hover:text-fg")}>
          {empty.action}
        </button>
      )}
    </div>
  );
}

function ResultsNode({ data }: NodeProps<Node<ResultsData, "results">>) {
  const { selected, onSelect, title, line } = data;
  return (
    <button
      type="button"
      onClick={() => onSelect("results")}
      aria-pressed={selected}
      style={{ width: RESULTS_WIDTH }}
      aria-label={`${line} ${title}`}
      className={cn(
        "flex h-[52px] items-center gap-3 rounded-full bg-surface pr-6 pl-3 text-left outline-none transition-shadow",
        selected ? "shadow-[0_0_0_2px_var(--accent)]" : "shadow-[0_0_0_1px_var(--line-strong)] hover:shadow-[0_0_0_1px_#c3bdb1]",
        "focus-visible:shadow-[0_0_0_2px_var(--accent)]",
      )}
    >
      <Ends />
      <AppLogo slug="chat" size={32} />
      <span className="flex min-w-0 flex-col">
        <span className={cn(T3, "text-muted")}>{line}</span>
        <span className={cn(T2, "truncate font-medium")}>{title}</span>
      </span>
    </button>
  );
}

function HeadNode({ data }: NodeProps<Node<HeadData, "head">>) {
  const { head, editing, onSkip, lane } = data;
  return (
    <div style={{ width: BOX_WIDTH }} className="flex h-7 items-center justify-between px-1">
      <span className={cn(T3, "font-semibold tracking-[0.02em] text-muted")}>{head.text}</span>
      {editing && head.skip && (lane === "read" || lane === "write") && (
        <button type="button" onClick={() => onSkip(lane)} className={cn(T3, "nodrag font-medium text-accent-dark hover:text-fg")}>
          {head.skip}
        </button>
      )}
    </div>
  );
}

const NODE_TYPES = { box: BoxNode, empty: EmptyNode, results: ResultsNode, head: HeadNode };

// ---------------------------------------------------------------- the lines

type LinkData = {
  plusY: number;
  conditionY: number | null;
  condition: CanvasCondition | null;
  inserts: Insert[];
  editing: boolean;
  canAdd: boolean;
  zone: "on" | "off" | null;
  over: boolean;
  onPlus: (inserts: Insert[]) => void;
  onCondition: () => void;
};

function LinkEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<LinkData, "link">>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  if (!data) return <BaseEdge id={id} path={path} />;
  const { plusY, conditionY, condition, inserts, editing, canAdd, zone, over, onPlus, onCondition } = data;
  const showPlus = editing && inserts.length > 0 && zone === null;
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: "var(--line-strong)", strokeWidth: 2, opacity: zone === "off" ? 0.35 : 1 }} />
      <EdgeLabelRenderer>
        {zone === "on" && (
          <div
            style={{ transform: `translate(-50%, -50%) translate(${sourceX}px, ${plusY}px)`, width: BOX_WIDTH - 40 }}
            className={cn(
              T3,
              "nodrag nopan pointer-events-none absolute flex h-10 items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-accent font-semibold text-accent-dark",
              over ? "bg-[#dfe5ff]" : "bg-accent-soft",
            )}
          >
            <PlusIcon size={14} strokeWidth={2.6} />
            Drop here
          </div>
        )}
        {showPlus && (
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => onPlus(inserts)}
            title={canAdd ? "Add a step here" : "An automation has up to 6 steps"}
            aria-label={canAdd ? "Add a step here" : "Up to 6 steps"}
            style={{ transform: `translate(-50%, -50%) translate(${sourceX}px, ${plusY}px)`, pointerEvents: "all" }}
            className="nodrag nopan absolute grid size-6 place-items-center rounded-full bg-surface text-muted shadow-[0_0_0_1px_var(--line-strong)] transition-colors hover:text-fg hover:shadow-[0_0_0_1px_var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon size={12} strokeWidth={2.8} />
          </button>
        )}
        {condition && conditionY !== null && (
          <button
            type="button"
            onClick={onCondition}
            style={{ transform: `translate(-50%, -50%) translate(${sourceX}px, ${conditionY}px)`, pointerEvents: "all", maxWidth: BOX_WIDTH }}
            className={cn(
              T3,
              "nodrag nopan absolute inline-flex h-7 items-center gap-2 rounded-full bg-surface px-3 font-medium whitespace-nowrap",
              condition.warn ? "text-warn shadow-[0_0_0_1px_var(--warn-dot)]" : "text-accent-dark shadow-[0_0_0_1px_var(--accent)]",
            )}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 3v12a4 4 0 0 0 4 4h8" />
              <path d="m15 16 3 3-3 3" />
            </svg>
            <span className="truncate">{condition.text}</span>
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const EDGE_TYPES = { link: LinkEdge };

// ---------------------------------------------------------------- the board

function Zoom() {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Controls showZoom={false} showFitView={false} showInteractive={false} orientation="horizontal" position="bottom-left" aria-label="Zoom">
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

function Board(props: LaneCanvasProps) {
  const { diagram, boxes, empties, results, heads, conditions, selected, count, editing, compact, dragging, onSelect, onRemove, onSkip, onPlus, onDrop, onDropTrigger, label } = props;
  const flow = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  const [over, setOver] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const conditioned = useMemo(() => new Set(conditions.keys()), [conditions]);
  const placed = useMemo(() => laneLayout(diagram, heights, conditioned), [diagram, heights, conditioned]);
  const stepLane = dragging && dragging !== "start" ? dragging : null;
  const zones = useMemo(() => (stepLane ? dropZones(diagram, stepLane, count) : []), [diagram, stepLane, count]);
  const zoneKeys = useMemo(() => new Set(zones.map((zone) => zone.key)), [zones]);
  const zoneOf = useCallback((key: string): "on" | "off" | null => (dragging ? (zoneKeys.has(key) || (dragging === "start" && key === "trigger") ? "on" : "off") : null), [dragging, zoneKeys]);

  // The column centred, its top near the top: at 100% on a wide screen, small enough to fit on a phone.
  const zoom = compact && width ? Math.min(1, (width - 32) / BOX_WIDTH) : 1;
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const placedOnce = useRef(false);
  useEffect(() => {
    if (!width) return;
    if (compact || !placedOnce.current) {
      placedOnce.current = true;
      void flow.setViewport({ x: width / 2, y: compact ? 16 : 32, zoom });
    }
  }, [width, compact, zoom, flow]);

  const shared = (key: string): Shared => ({ selected: selected === key, editing, over: over === key, zone: zoneOf(key), onSelect, onRemove });
  const nodes: Node[] = [];
  for (const item of diagram.items) {
    const at = placed.boxes.get(item.key)!;
    const base = { id: item.key, position: { x: at.x, y: at.y }, draggable: false, selectable: false, connectable: false, focusable: false };
    if (item.kind === "results") nodes.push({ ...base, type: "results", data: { ...shared(item.key), ...results } });
    else if (item.kind === "empty") {
      const empty = empties.get(item.key);
      if (empty) nodes.push({ ...base, type: "empty", data: { ...shared(item.key), empty, onAdd: () => onPlus(zonesFor(diagram, item.lane, count)) } });
    } else {
      const box = boxes.get(item.key);
      if (box) nodes.push({ ...base, type: "box", data: { ...shared(item.key), box, trigger: item.kind === "trigger" } });
    }
  }
  for (const head of heads) {
    const at = placed.heads.get(head.before);
    const lane = diagram.heads.find((item) => item.before === head.before)?.lane ?? "start";
    if (at) nodes.push({ id: `head:${head.before}`, type: "head", position: { x: at.x, y: at.y }, draggable: false, selectable: false, connectable: false, focusable: false, data: { head, onSkip, editing, lane } });
  }
  const edges: Edge[] = diagram.gaps.map((gap) => {
    const at = placed.gaps.get(gap.id)!;
    const condition = conditions.get(gap.to) ?? null;
    return {
      id: gap.id,
      source: gap.from,
      target: gap.to,
      type: "link",
      selectable: false,
      focusable: false,
      data: {
        plusY: at.plusY,
        conditionY: at.conditionY,
        condition,
        inserts: gap.inserts,
        editing,
        canAdd: count < MAX_STEPS,
        zone: dragging ? (zoneKeys.has(gap.id) ? "on" : "off") : null,
        over: over === gap.id,
        onPlus,
        onCondition: () => onSelect(gap.to),
      } satisfies LinkData,
    };
  });

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setHeights((current) => {
      let next: Map<string, number> | null = null;
      for (const change of changes) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        if (current.get(change.id) === change.dimensions.height) continue;
        next ??= new Map(current);
        next.set(change.id, change.dimensions.height);
      }
      return next ?? current;
    });
  }, []);

  const point = (event: DragEvent) => flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
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
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#d4cfc4" />
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

export default function LaneCanvas(props: LaneCanvasProps) {
  return (
    <ReactFlowProvider>
      <Board {...props} />
    </ReactFlowProvider>
  );
}
