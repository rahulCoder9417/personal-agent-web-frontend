import { describe, expect, it } from "vitest";
import { laneDiagram, stepLanes } from "./automation-lanes";
import { emptyStep } from "./automation-steps";
import {
  BOX_WIDTH,
  conditionKey,
  CONDITION_HEIGHT,
  GAP,
  GRID,
  GUESS,
  HEAD_HEIGHT,
  laneLayout,
  nearestZone,
  NO_X_COMPACT,
  RESULTS_WIDTH,
  STOP_OFFSET_X,
  YES_GAP,
  YES_GAP_COMPACT,
} from "./lane-layout";

const steps = [
  { ...emptyStep("action", "a"), app: "gmail", action: "GMAIL_FETCH_EMAILS" },
  { ...emptyStep("tex", "b"), instruction: "Is it urgent?" },
  { ...emptyStep("action", "c"), app: "gmail", action: "GMAIL_SEND_EMAIL", risky: true },
];
const changes = (_: string, action: string) => action === "GMAIL_SEND_EMAIL";
const diagram = laneDiagram(steps, stepLanes(steps, changes));

describe("the canvas's layout", () => {
  it("puts the boxes in one column on one centre line, all as wide, top to bottom, on the 8px grid", () => {
    const placed = laneLayout(diagram);
    const trigger = placed.boxes.get("trigger")!;
    // The first lane's name above the trigger; every other one at the foot of the line into its first box.
    expect(placed.heads.get("trigger")).toEqual({ x: -BOX_WIDTH / 2, y: 0, width: BOX_WIDTH, height: HEAD_HEIGHT });
    expect(trigger).toEqual({ x: -BOX_WIDTH / 2, y: HEAD_HEIGHT + GRID, width: BOX_WIDTH, height: GUESS.trigger });
    const read = placed.boxes.get("step:a")!;
    expect(read.y).toBe(trigger.y + trigger.height + GAP);
    expect(placed.heads.get("step:a")!.y + HEAD_HEIGHT).toBe(read.y);
    const results = placed.boxes.get("results")!;
    expect(RESULTS_WIDTH).toBe(BOX_WIDTH);
    expect(results.x).toBe(-BOX_WIDTH / 2);
    expect(placed.height).toBe(results.y + results.height);
    const ys = diagram.items.map((item) => placed.boxes.get(item.key)!.y);
    expect([...ys].sort((p, q) => p - q)).toEqual(ys);
    for (const box of placed.boxes.values()) {
      expect(box.x + box.width / 2).toBe(0);
      expect(box.y % GRID).toBe(0);
      expect(box.height % GRID).toBe(0);
    }
    // Every line as long as the others, its "+" in its middle.
    for (const gap of placed.gaps.values()) {
      expect(gap.bottom - gap.top).toBe(GAP);
      expect(gap.plusY).toBe(gap.top + GAP / 2);
    }
  });

  it("uses each box's measured height once it is drawn, rounded up to the grid", () => {
    const tall = laneLayout(diagram, new Map([["step:a", 157]]));
    expect(tall.boxes.get("step:a")!.height).toBe(160);
    expect(tall.boxes.get("step:b")!.y - laneLayout(diagram).boxes.get("step:b")!.y).toBe(160 - GUESS.step);
  });

  it("draws a step's 'only if' as a condition box on the line into it, with its Stop to the right", () => {
    const placed = laneLayout(diagram, new Map(), new Set(["step:c"]));
    const gap = placed.gaps.get("step:b->step:c")!;
    const condition = placed.conditions.get("step:c")!;
    const stop = placed.stops.get("step:c")!;
    const step = placed.boxes.get("step:c")!;
    // The line from the step before ends at the condition; "Yes" goes on to the step.
    expect(condition).toEqual({ x: -BOX_WIDTH / 2, y: gap.bottom, width: BOX_WIDTH, height: CONDITION_HEIGHT });
    expect(gap.conditionY).toBe(condition.y + condition.height / 2);
    expect(step.y).toBe(condition.y + condition.height + YES_GAP);
    // The Stop: right of the column, lower than the condition's middle, clear of the next step.
    expect(stop.x).toBe(BOX_WIDTH / 2 + STOP_OFFSET_X);
    expect(stop.y + stop.height / 2).toBeGreaterThan(gap.conditionY!);
    expect(stop.y + stop.height).toBeLessThan(step.y);
    expect(placed.right).toBe(stop.x + stop.width);
    expect(placed.left).toBe(-BOX_WIDTH / 2);
    // No condition on the other lines.
    expect(placed.gaps.get("step:a->step:b")!.conditionY).toBeNull();
    expect(placed.conditions.has("step:b")).toBe(false);
    // A measured condition is used, as any box.
    expect(laneLayout(diagram, new Map([[conditionKey("step:c"), 90]]), new Set(["step:c"])).conditions.get("step:c")!.height).toBe(96);
  });

  it("on a phone keeps the Stop under the condition, inside the column's width", () => {
    const placed = laneLayout(diagram, new Map(), new Set(["step:c"]), { compact: true });
    const condition = placed.conditions.get("step:c")!;
    const stop = placed.stops.get("step:c")!;
    const step = placed.boxes.get("step:c")!;
    expect(stop.x + stop.width / 2).toBe(NO_X_COMPACT);
    expect(stop.x).toBeGreaterThan(0);
    expect(stop.x + stop.width).toBeLessThanOrEqual(BOX_WIDTH / 2);
    expect(stop.y).toBeGreaterThan(condition.y + condition.height);
    expect(stop.y + stop.height).toBeLessThan(step.y);
    expect(step.y).toBe(condition.y + condition.height + YES_GAP_COMPACT);
    expect(placed.width).toBe(BOX_WIDTH);
  });

  it("finds the place nearest the pointer among those a dragged block can go", () => {
    const placed = laneLayout(diagram);
    const zones = [{ key: "trigger->step:a" }, { key: "step:a->step:b" }];
    const second = placed.gaps.get("step:a->step:b")!;
    expect(nearestZone(placed, zones, { x: 0, y: second.top + 4 })).toBe("step:a->step:b");
    expect(nearestZone(placed, zones, { x: 0, y: -50 })).toBe("trigger->step:a");
    expect(nearestZone(placed, [], { x: 0, y: 0 })).toBeNull();
  });
});
