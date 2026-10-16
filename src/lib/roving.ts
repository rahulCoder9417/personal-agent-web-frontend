// The keys of a group where one item is chosen and the arrows move between them (a segmented
// control, a set of radio cards): WAI-ARIA's radio group. Only the chosen item is reached with Tab;
// the arrows move to the next item that can be picked, going round at the ends, and choose it.
// Home and End go to the first and the last. Nothing here draws (`segmented-control.tsx` does).

export type RovingOrientation = "horizontal" | "vertical" | "both";

const NEXT: Record<RovingOrientation, readonly string[]> = {
  horizontal: ["ArrowRight"],
  vertical: ["ArrowDown"],
  both: ["ArrowRight", "ArrowDown"],
};
const PREVIOUS: Record<RovingOrientation, readonly string[]> = {
  horizontal: ["ArrowLeft"],
  vertical: ["ArrowUp"],
  both: ["ArrowLeft", "ArrowUp"],
};

/** The item `by` places from `from` that can be picked, going round the ends; `from` when none can. */
function around(disabled: readonly boolean[], from: number, by: 1 | -1): number {
  const count = disabled.length;
  for (let k = 1; k <= count; k++) {
    const at = (((from + by * k) % count) + count) % count;
    if (!disabled[at]) return at;
  }
  return from;
}

/**
 * Where a key moves the focus (and the choice) in the group, or null for a key the group leaves
 * alone. `current` is the item the focus is on; `disabled` says, item by item, which can't be picked.
 */
export function rovingKey(key: string, current: number, disabled: readonly boolean[], orientation: RovingOrientation = "both"): number | null {
  if (disabled.length === 0 || disabled.every(Boolean)) return null;
  if (key === "Home") return disabled.findIndex((off) => !off);
  if (key === "End") return disabled.findLastIndex((off) => !off);
  if (NEXT[orientation].includes(key)) return around(disabled, current, 1);
  if (PREVIOUS[orientation].includes(key)) return around(disabled, current, -1);
  return null;
}

/** The item Tab lands on: the chosen one, else the first that can be picked. */
export function tabStop(chosen: number, disabled: readonly boolean[]): number {
  return chosen >= 0 && !disabled[chosen] ? chosen : disabled.findIndex((off) => !off);
}
