"use client";

// The canvas of one automation: its five steps as boxes joined by arrows, drawn by React Flow
// (@xyflow/react, MIT, pinned at 12.12.0). Loaded only on an automation's own page, and only on a
// wide screen (flow-view.tsx), so no other page and no phone downloads it.
//
// The boxes sit where this file puts them, in one line, as many as the flow has (today's five; an
// automation with steps puts each of them between Tex's and the results' boxes), so no layout library
// is needed, can't be dragged or joined, and the canvas only pans and zooms. Each
// box is a real button: Tab reaches it, Enter or a click opens its details, or, while the
// automation is being edited, its settings, beside the canvas. A box with a problem is red, with the
// problem under its title. The small "React Flow" link in the corner stays (the founder's decision).

import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { AppHealth } from "@/lib/automation-apps";
import type { FlowStep } from "@/lib/automation-flow";
import type { AutomationKind } from "@/lib/automations";
import { cn } from "@/lib/format";
import { WarningIcon } from "../icons";
import { AppChips, StepBadge } from "./flow-chain";
import { ChangedTag } from "./flow-parts";

export const NODE_WIDTH = 216;
export const NODE_GAP = 44;
/** Every box is as tall as the others, so the arrows between them run straight. */
export const NODE_HEIGHT = 156;

type StepData = {
  step: FlowStep;
  kind: AutomationKind;
  index: number;
  selected: boolean;
  changed: boolean;
  /** What is wrong with this box, in the server's words (while editing). */
  problems: readonly string[];
  /** Editing: a click opens the box's settings rather than its details. */
  editing: boolean;
  panelId: string;
  health?: ReadonlyMap<string, AppHealth>;
  onSelect: (key: string) => void;
};
type StepNode = Node<StepData, "step">;

const HANDLE = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function StepBox({ data }: NodeProps<StepNode>) {
  const { step, kind, index, selected, changed, problems, editing, panelId, health, onSelect } = data;
  const wrong = problems.length > 0;
  // The apps step and an app trigger show their apps as chips; the others their short lines.
  const chips = step.id === "apps" || (step.id === "trigger" && step.apps.length > 0) ? step.apps : step.id === "results" ? step.apps : [];
  const lines = step.id === "instruction" ? step.lines.filter((line) => line !== step.title).slice(0, 1) : step.lines.slice(-1);
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className={HANDLE} />
      <button
        type="button"
        onClick={() => onSelect(step.key)}
        aria-pressed={selected}
        aria-controls={panelId}
        aria-label={`Step ${index + 1}, ${step.label}: ${step.title}.${wrong ? ` Problem: ${problems.join(" ")}` : ""} ${editing ? "Edit it" : "Show its details"}`}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        className={cn(
          "group flex flex-col gap-2 overflow-hidden rounded-[14px] border bg-surface p-3 text-left transition-[border-color,box-shadow] outline-none",
          "shadow-[0_1px_2px_rgb(21_21_21/0.05)] focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
          selected ? "border-accent shadow-[0_0_0_1px_var(--accent),0_12px_28px_-18px_var(--accent)]" : "border-line hover:border-line-strong",
          step.tone === "danger" && !selected && "border-danger/45",
          wrong && (selected ? "border-danger shadow-[0_0_0_1px_var(--danger)]" : "border-danger bg-danger-soft/40"),
        )}
      >
        <span className="flex items-center gap-2">
          <StepBadge step={step} kind={kind} size={28} />
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-muted">{step.label}</span>
          {changed && <ChangedTag />}
          <span
            aria-hidden
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold tabular-nums",
              wrong ? "bg-danger text-white" : selected ? "bg-accent text-white" : "bg-surface-2 text-muted",
            )}
          >
            {wrong ? <WarningIcon size={11} /> : index + 1}
          </span>
        </span>
        <span className={cn("line-clamp-2 text-[13.5px] leading-snug font-semibold break-words", step.tone === "paused" ? "text-nav" : "text-fg")}>{step.title}</span>
        {wrong ? (
          <span className="line-clamp-2 text-[12px] leading-snug font-medium break-words text-danger">{problems[0]}</span>
        ) : chips.length > 0 ? (
          <AppChips apps={chips.slice(0, 3)} health={health} small className="mt-auto max-h-[46px] overflow-hidden" />
        ) : (
          lines.map((line) => (
            <span
              key={line}
              className={cn(
                "line-clamp-2 text-[12px] leading-snug break-words",
                step.tone === "danger" && line.startsWith("Paused") ? "font-medium text-danger" : "text-muted",
              )}
            >
              {line}
            </span>
          ))
        )}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} className={HANDLE} />
    </>
  );
}

const NODE_TYPES = { step: StepBox };
/** The arrows' colour, from the design tokens (so a dark set of tokens darkens them too). */
const ARROW = "color-mix(in srgb, var(--muted) 55%, transparent)";

/** The boxes, left to right, and the arrows between them. */
export function canvasElements(
  steps: readonly FlowStep[],
  kind: AutomationKind,
  options: {
    selected: string | null;
    changed?: ReadonlySet<string>;
    problems?: ReadonlyMap<string, readonly string[]>;
    editing?: boolean;
    panelId: string;
    health?: ReadonlyMap<string, AppHealth>;
    onSelect: (key: string) => void;
  },
): { nodes: StepNode[]; edges: Edge[] } {
  const nodes: StepNode[] = steps.map((step, index) => ({
    id: step.key,
    type: "step",
    position: { x: index * (NODE_WIDTH + NODE_GAP), y: 0 },
    data: {
      step,
      kind,
      index,
      selected: options.selected === step.key,
      changed: options.changed?.has(step.key) ?? false,
      problems: options.problems?.get(step.key) ?? [],
      editing: options.editing ?? false,
      panelId: options.panelId,
      health: options.health,
      onSelect: options.onSelect,
    },
    draggable: false,
    connectable: false,
    selectable: false,
    focusable: false,
  }));
  const edges: Edge[] = steps.slice(1).map((step, index) => ({
    id: `${steps[index].key}-${step.key}`,
    source: steps[index].key,
    target: step.key,
    type: "smoothstep",
    focusable: false,
    selectable: false,
    style: { stroke: ARROW, strokeWidth: 1.75 },
    markerEnd: { type: MarkerType.ArrowClosed, color: ARROW, width: 14, height: 14 },
  }));
  return { nodes, edges };
}

export default function FlowCanvas({
  steps,
  kind,
  selected,
  changed,
  problems,
  editing,
  panelId,
  health,
  onSelect,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  selected: string | null;
  changed?: ReadonlySet<string>;
  problems?: ReadonlyMap<string, readonly string[]>;
  editing?: boolean;
  panelId: string;
  /** How each app stands, so a disconnected one is marked on its box. */
  health?: ReadonlyMap<string, AppHealth>;
  onSelect: (key: string) => void;
}) {
  const { nodes, edges } = useMemo(
    () => canvasElements(steps, kind, { selected, changed, problems, editing, panelId, health, onSelect }),
    [steps, kind, selected, changed, problems, editing, panelId, health, onSelect],
  );
  return (
    <div className="automation-canvas h-[256px] w-full min-w-0 overflow-hidden rounded-2xl border border-line bg-surface-2/70">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_event, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.06, maxZoom: 1.1 }}
        minZoom={0.35}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        aria-label="The automation as a flow"
      >
        <Background gap={18} size={1} color="var(--line-strong)" />
        <Controls showInteractive={false} position="bottom-left" orientation="horizontal" />
      </ReactFlow>
    </div>
  );
}
