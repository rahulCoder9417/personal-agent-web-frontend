import { describe, expect, it } from "vitest";
import { laneDiagram, stepLanes } from "./automation-lanes";
import { emptyStep } from "./automation-steps";
import { BOX_WIDTH, CONDITION_ROOM, GAP, GUESS, HEAD_HEIGHT, laneLayout, nearestZone, RESULTS_WIDTH } from "./lane-layout";

const steps = [
  { ...emptyStep("action", "a"), app: "gmail", action: "GMAIL_FETCH_EMAILS" },
  { ...emptyStep("tex", "b"), instruction: "Is it urgent?" },
  { ...emptyStep("action", "c"), app: "gmail", action: "GMAIL_SEND_EMAIL", risky: true },
];
const changes = (_: string, action: string) => action === "GMAIL_SEND_EMAIL";
const diagram = laneDiagram(steps, stepLanes(steps, changes));

describe("the canvas's layout", () => {
  it("puts the boxes in one column, centred, top to bottom, each lane's name above its first box", () => {
    const placed = laneLayout(diagram);
    const trigger = placed.boxes.get("trigger")!;
    expect(trigger).toEqual({ x: -BOX_WIDTH / 2, y: HEAD_HEIGHT, width: BOX_WIDTH, height: GUESS.trigger });
    expect(placed.heads.get("trigger")).toEqual({ x: -BOX_WIDTH / 2, y: 0, width: BOX_WIDTH, height: HEAD_HEIGHT });
    const read = placed.boxes.get("step:a")!;
    expect(placed.heads.get("step:a")!.y).toBe(trigger.y + trigger.height + GAP);
    expect(read.y).toBe(trigger.y + trigger.height + GAP + HEAD_HEIGHT);
    const results = placed.boxes.get("results")!;
    expect(results.x).toBe(-RESULTS_WIDTH / 2);
    expect(placed.height).toBe(results.y + results.height);
    const ys = diagram.items.map((item) => placed.boxes.get(item.key)!.y);
    expect([...ys].sort((p, q) => p - q)).toEqual(ys);
  });

  it("uses each box's measured height once it is drawn, and makes room for an 'only if' pill", () => {
    const tall = laneLayout(diagram, new Map([["step:a", 160]]));
    expect(tall.boxes.get("step:b")!.y - laneLayout(diagram).boxes.get("step:b")!.y).toBe(160 - GUESS.step);
    const into = laneLayout(diagram, new Map(), new Set(["step:c"]));
    const gap = into.gaps.get("step:b->step:c")!;
    expect(gap.bottom - gap.top).toBe(GAP + CONDITION_ROOM);
    expect(gap.conditionY).not.toBeNull();
    expect(gap.plusY).toBeLessThan(gap.conditionY!);
    expect(into.gaps.get("step:a->step:b")!.conditionY).toBeNull();
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
