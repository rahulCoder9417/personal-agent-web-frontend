"use client";

// The canvas of one automation: its five steps as boxes joined by arrows, drawn by React Flow
// (@xyflow/react, MIT, pinned at 12.12.0). Loaded only on an automation's own page, and only on a
// wide screen (flow-view.tsx), so no other page and no phone downloads it.
//
// Read-only: the boxes sit where this file puts them (today's shape is always the same line of
// five, so no layout library is needed), can't be dragged or joined, and the canvas only pans and
// zooms. Each box is a real button: Tab reaches it, Enter or a click opens its details beside the
// canvas. The small "React Flow" link in the corner stays (the founder's decision).

import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { FlowStep, FlowStepId } from "@/lib/automation-flow";
import type { AutomationKind } from "@/lib/automations";
import { cn } from "@/lib/format";
import { ChangedTag, StepMark } from "./flow-parts";

export const NODE_WIDTH = 200;
export const NODE_GAP = 40;
/** Every box is as tall as the others, so the arrows between them run straight. */
export const NODE_HEIGHT = 148;

type StepData = {
  step: FlowStep;
  kind: AutomationKind;
  index: number;
  selected: boolean;
  changed: boolean;
  panelId: string;
  onSelect: (id: FlowStepId) => void;
};
type StepNode = Node<StepData, "step">;

function StepBox({ data }: NodeProps<StepNode>) {
  const { step, kind, index, selected, changed, panelId, onSelect } = data;
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <button
        type="button"
        onClick={() => onSelect(step.id)}
        aria-pressed={selected}
        aria-controls={panelId}
        aria-label={`Step ${index + 1}, ${step.label}: ${step.title}. Show its details`}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        className={cn(
          "flex flex-col gap-2 overflow-hidden rounded-xl border bg-surface p-3 text-left transition-shadow outline-none",
          "focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
          selected ? "border-accent shadow-[0_0_0_1px_var(--accent),0_10px_30px_-16px_rgb(51_85_245/0.5)]" : "border-line hover:border-line-strong",
          step.tone === "danger" && !selected && "border-danger/40",
        )}
      >
        <span className="flex items-center gap-2">
          <StepMark step={step} kind={kind} size={26} />
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-muted">{step.label}</span>
          {changed && <ChangedTag />}
        </span>
        <span className={cn("line-clamp-2 text-[13.5px] leading-snug font-semibold break-words", step.tone === "paused" ? "text-nav" : "text-fg")}>
          {step.title}
        </span>
        {step.lines.length > 0 && (
          <span className="flex flex-col gap-0.5">
            {step.lines.slice(-2).map((line) => (
              <span
                key={line}
                className={cn(
                  "text-[12px] leading-snug",
                  step.lines.length === 1 ? "line-clamp-2 break-words" : "truncate",
                  step.tone === "danger" && line.startsWith("Paused") ? "font-medium text-danger" : "text-muted",
                )}
              >
                {line}
              </span>
            ))}
          </span>
        )}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
    </>
  );
}

const NODE_TYPES = { step: StepBox };
const ARROW = "#b8b3a8";

/** The boxes, left to right, and the arrows between them. */
export function canvasElements(
  steps: readonly FlowStep[],
  kind: AutomationKind,
  options: { selected: FlowStepId | null; changed?: ReadonlySet<FlowStepId>; panelId: string; onSelect: (id: FlowStepId) => void },
): { nodes: StepNode[]; edges: Edge[] } {
  const nodes: StepNode[] = steps.map((step, index) => ({
    id: step.id,
    type: "step",
    position: { x: index * (NODE_WIDTH + NODE_GAP), y: 0 },
    data: {
      step,
      kind,
      index,
      selected: options.selected === step.id,
      changed: options.changed?.has(step.id) ?? false,
      panelId: options.panelId,
      onSelect: options.onSelect,
    },
    draggable: false,
    connectable: false,
    selectable: false,
    focusable: false,
  }));
  const edges: Edge[] = steps.slice(1).map((step, index) => ({
    id: `${steps[index].id}-${step.id}`,
    source: steps[index].id,
    target: step.id,
    type: "straight",
    focusable: false,
    selectable: false,
    style: { stroke: ARROW, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: ARROW, width: 16, height: 16 },
  }));
  return { nodes, edges };
}

export default function FlowCanvas({
  steps,
  kind,
  selected,
  changed,
  panelId,
  onSelect,
}: {
  steps: readonly FlowStep[];
  kind: AutomationKind;
  selected: FlowStepId | null;
  changed?: ReadonlySet<FlowStepId>;
  panelId: string;
  onSelect: (id: FlowStepId) => void;
}) {
  const { nodes, edges } = useMemo(
    () => canvasElements(steps, kind, { selected, changed, panelId, onSelect }),
    [steps, kind, selected, changed, panelId, onSelect],
  );
  return (
    <div className="automation-canvas h-[260px] w-full min-w-0 overflow-hidden rounded-xl border border-line bg-surface-2/60">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_event, node) => onSelect(node.id as FlowStepId)}
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
        <Background gap={18} size={1} color="#dcd8cf" />
        <Controls showInteractive={false} position="bottom-left" orientation="horizontal" />
      </ReactFlow>
    </div>
  );
}
