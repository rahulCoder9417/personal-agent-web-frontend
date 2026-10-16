"use client";

// The canvas of an automation with steps (phase 4): Trigger → Step 1 … Step N → Results, a step's
// "only if" as a short label on the arrow into it, and beside it a small grey exit, "otherwise:
// stop". dagre places the boxes (`step-layout.ts`): left to right from 1,280 px, top to bottom below.
// While editing, a "+" on each arrow puts a new step there (greyed at 6). After a run, each box
// shows how its step went in the last run.
//
// A chunk of its own, with React Flow and dagre, loaded only on an automation's page from 768 px
// (flow-view.tsx, automation-editor.tsx): no phone and no other page fetches it.

import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { AppHealth } from "@/lib/automation-apps";
import type { FlowStep } from "@/lib/automation-flow";
import { ACROSS_QUERY, MAX_STEPS, type TrailMark } from "@/lib/automation-steps";
import type { AutomationKind } from "@/lib/automations";
import { cn } from "@/lib/format";
import { useMediaQuery } from "@/lib/media-query";
import { BOX_HEIGHT, BOX_WIDTH, layoutGraph, stepGraph, type Direction } from "@/lib/step-layout";
import { LockIcon, WarningIcon } from "../icons";
import { AppChips, StepBadge } from "./flow-chain";
import { ChangedTag, TRAIL_TAG } from "./flow-parts";

/** The arrows' colours, from the design tokens (as on the five-box canvas, flow-canvas.tsx). */
const ARROW = "color-mix(in srgb, var(--muted) 55%, transparent)";
const EXIT_LINE = "var(--line-strong)";


type BoxData = {
  step: FlowStep;
  kind: AutomationKind;
  direction: Direction;
  selected: boolean;
  changed: boolean;
  problems: readonly string[];
  trail: TrailMark | null;
  editing: boolean;
  panelId: string;
  /** Its place in the flow, for the number on the box (1 is the trigger). */
  place: number;
  health?: ReadonlyMap<string, AppHealth>;
  onSelect: (key: string) => void;
};
type ExitData = { label: string; direction: Direction };
type BoxNode = Node<BoxData, "box">;
type ExitNode = Node<ExitData, "exit">;

type EdgeData = {
  kind: "next" | "exit";
  label: string | null;
  insertAt: number | null;
  editing: boolean;
  canAdd: boolean;
  onInsert?: (at: number) => void;
};
type StepEdgeT = Edge<EdgeData, "step">;

const HIDDEN_HANDLE = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function Box({ data }: NodeProps<BoxNode>) {
  const { step, kind, direction, selected, changed, problems, trail, editing, panelId, place, health, onSelect } = data;
  const wrong = problems.length > 0;
  const info = step.step;
  const across = direction === "across";
  return (
    <>
      <Handle type="target" position={across ? Position.Left : Position.Top} isConnectable={false} className={HIDDEN_HANDLE} />
      <button
        type="button"
        onClick={() => onSelect(step.key)}
        aria-pressed={selected}
        aria-controls={panelId}
        aria-label={`${step.label}: ${step.title}.${info?.condition ? ` Runs ${info.condition.replace(/^only if:? /, "only if ")}.` : ""}${trail ? ` Last run: ${trail.label}.` : ""}${wrong ? ` Problem: ${problems.join(" ")}` : ""} ${editing ? "Edit it" : "Show its details"}`}
        style={{ width: BOX_WIDTH, height: BOX_HEIGHT }}
        className={cn(
          "flex flex-col gap-1.5 overflow-hidden rounded-[14px] border bg-surface p-3 text-left transition-[border-color,box-shadow] outline-none",
          "shadow-[0_1px_2px_rgb(21_21_21/0.05)] focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
          selected ? "border-accent shadow-[0_0_0_1px_var(--accent),0_12px_28px_-18px_var(--accent)]" : "border-line hover:border-line-strong",
          step.tone === "danger" && !selected && "border-danger/40",
          wrong && (selected ? "border-danger shadow-[0_0_0_1px_var(--danger)]" : "border-danger bg-danger-soft/40"),
        )}
      >
        <span className="flex items-center gap-2">
          <StepBadge step={step} kind={kind} size={26} />
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-muted">{step.label}</span>
          {info?.askFirst && (
            <span title={info.locked ? "Always asks you first" : "Asks you first"} className="text-[color-mix(in_srgb,var(--patch)_72%,var(--fg))]">
              <LockIcon size={13} />
            </span>
          )}
          {changed && <ChangedTag />}
          <span
            aria-hidden
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold tabular-nums",
              wrong ? "bg-danger text-white" : selected ? "bg-accent text-white" : "bg-surface-2 text-muted",
            )}
          >
            {wrong ? <WarningIcon size={11} /> : place}
          </span>
        </span>
        <span className={cn("line-clamp-2 text-[13.5px] leading-snug font-semibold break-words", step.tone === "paused" ? "text-nav" : "text-fg")}>{step.title}</span>
        {wrong ? (
          <span className="line-clamp-2 text-[12px] leading-snug font-medium break-words text-danger">{problems[0]}</span>
        ) : step.apps.length > 0 && (info || step.id === "trigger") ? (
          <AppChips apps={step.apps.slice(0, 2)} health={health} small className="max-h-[22px] overflow-hidden" />
        ) : (
          step.lines.length > 0 && <span className="line-clamp-1 text-[12px] leading-snug break-words text-muted">{step.lines[step.lines.length - 1]}</span>
        )}
        <span className="mt-auto flex min-w-0 flex-wrap items-center gap-1">
          {trail && <span className={cn("max-w-full truncate rounded px-1.5 text-[10.5px] leading-[16px] font-semibold", TRAIL_TAG[trail.tone])}>{trail.label}</span>}
          {info?.showResult && <span className="rounded bg-surface-2 px-1.5 text-[10.5px] leading-[16px] font-medium text-fg-2">Show me this</span>}
        </span>
      </button>
      <Handle type="source" position={across ? Position.Right : Position.Bottom} isConnectable={false} className={HIDDEN_HANDLE} />
    </>
  );
}

function Exit({ data }: NodeProps<ExitNode>) {
  return (
    <>
      <Handle type="target" position={data.direction === "across" ? Position.Top : Position.Left} isConnectable={false} className={HIDDEN_HANDLE} />
      <span className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-line-strong bg-surface text-[11.5px] font-medium text-muted">
        {data.label}
      </span>
    </>
  );
}

function StepEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps<StepEdgeT>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 10 });
  const insertAt = data?.insertAt ?? null;
  const showAdd = Boolean(data?.editing && insertAt !== null && data.onInsert);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {(data?.label || showAdd) && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
            className="nodrag nopan absolute flex max-w-[108px] flex-col items-center gap-1"
          >
            {data?.label && (
              <span className="line-clamp-3 rounded-full bg-surface px-2 py-0.5 text-center text-[10.5px] leading-snug font-medium text-fg-2 shadow-[0_0_0_1px_var(--line-strong)]">
                {data.label}
              </span>
            )}
            {showAdd && (
              <button
                type="button"
                disabled={!data!.canAdd}
                onClick={() => data!.onInsert!(insertAt!)}
                title={data!.canAdd ? "Add a step here" : `Up to ${MAX_STEPS} steps`}
                aria-label={data!.canAdd ? `Add a step here, as step ${insertAt! + 1}` : `Up to ${MAX_STEPS} steps`}
                className="grid size-6 place-items-center rounded-full border border-line-strong bg-surface text-[14px] leading-none font-semibold text-fg-2 shadow-[var(--shadow-raised)] transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = { box: Box, exit: Exit };
const EDGE_TYPES = { step: StepEdge };

export type StepsCanvasProps = {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  selected: string | null;
  changed?: ReadonlySet<string>;
  problems?: ReadonlyMap<string, readonly string[]>;
  /** How each step went in the last run, by the step's own id. */
  trail?: ReadonlyMap<string, TrailMark>;
  editing?: boolean;
  /** Editing: put a new step at this place (0 is first). */
  onInsert?: (at: number) => void;
  /** How many steps there are (for the "+" at 6). */
  count?: number;
  panelId: string;
  /** How each app stands, so a disconnected one is marked on its box. */
  health?: ReadonlyMap<string, AppHealth>;
  onSelect: (key: string) => void;
  /** Left out: from the window's width. */
  direction?: Direction;
};

/** The nodes and edges React Flow draws, placed by dagre. */
export function stepsElements(props: StepsCanvasProps & { direction: Direction }): { nodes: Array<BoxNode | ExitNode>; edges: StepEdgeT[]; height: number } {
  const graph = stepGraph(props.steps);
  const placed = layoutGraph(graph, props.direction);
  const canAdd = (props.count ?? props.steps.filter((step) => step.step).length) < MAX_STEPS;
  const nodes: Array<BoxNode | ExitNode> = graph.nodes.map((node) => {
    const position = placed.positions.get(node.id) ?? { x: 0, y: 0 };
    const common = { id: node.id, position, draggable: false, connectable: false, selectable: false, focusable: false };
    if (node.kind === "exit") return { ...common, type: "exit", data: { label: node.label ?? "", direction: props.direction }, style: { width: node.width, height: node.height } };
    const step = node.step!;
    return {
      ...common,
      type: "box",
      data: {
        step,
        kind: props.kind,
        direction: props.direction,
        selected: props.selected === step.key,
        changed: props.changed?.has(step.key) ?? false,
        problems: props.problems?.get(step.key) ?? [],
        trail: step.step ? (props.trail?.get(step.step.id) ?? null) : null,
        editing: props.editing ?? false,
        panelId: props.panelId,
        place: (node.index ?? 0) + 1,
        health: props.health,
        onSelect: props.onSelect,
      },
    };
  });
  const edges: StepEdgeT[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "step",
    focusable: false,
    selectable: false,
    data: { kind: edge.kind, label: edge.label, insertAt: edge.insertAt, editing: props.editing ?? false, canAdd, ...(props.onInsert ? { onInsert: props.onInsert } : {}) },
    style: edge.kind === "exit" ? { stroke: EXIT_LINE, strokeWidth: 1.25, strokeDasharray: "4 4" } : { stroke: ARROW, strokeWidth: 1.75 },
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.kind === "exit" ? EXIT_LINE : ARROW, width: 14, height: 14 },
  }));
  return { nodes, edges, height: placed.height };
}

export default function StepsCanvas(props: StepsCanvasProps) {
  const across = useMediaQuery(ACROSS_QUERY);
  const direction: Direction = props.direction ?? (across ? "across" : "down");
  const { nodes, edges, height } = useMemo(() => stepsElements({ ...props, direction }), [props, direction]);
  // Tall enough for the flow at a readable size: wider screens fit it in a band, narrower ones grow.
  const boxHeight = direction === "across" ? Math.max(300, Math.min(520, height + 90)) : Math.max(320, Math.min(1100, height * 0.75 + 80));
  return (
    <div className="automation-canvas w-full min-w-0 overflow-hidden rounded-2xl border border-line bg-surface-2/70" style={{ height: boxHeight }}>
      <ReactFlow
        // A new shape (another direction, a step added or removed) is fitted to the view again.
        key={`${direction}:${props.steps.map((step) => step.key).join(",")}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={(_event, node) => {
          if (node.type === "box") props.onSelect(node.id);
        }}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1.05 }}
        minZoom={0.3}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        aria-label="The automation's steps as a flow"
      >
        <Background gap={18} size={1} color="var(--line-strong)" />
        <Controls showInteractive={false} position="bottom-left" orientation="horizontal" />
      </ReactFlow>
    </div>
  );
}
