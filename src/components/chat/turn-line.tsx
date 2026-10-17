import type { ProgressLine } from "@/lib/crew";
import { cn } from "@/lib/format";
import type { TurnFoot } from "@/lib/turn-line";
import { AgentFigure } from "../tex";

const WORDS = { working: "Tex is working…", writing: "Tex is writing…", waiting: "Waiting for your OK" } as const;

/**
 * The one line at the foot of a turn, under the newest thing on screen (`threadFoot` in
 * `src/lib/turn-line.ts`): "Tex is writing…", "Tex is working…" or "Waiting for your OK". It stays in
 * the same place from the turn's first step or draft until the turn is over; only its words change.
 * It sits 6px under what is above it, as a message's line of channel and time does. `lines`: the
 * crew's latest line each, shown under it when no step is on screen to carry them.
 */
export function TurnLine({ foot, lines = [] }: { foot: Exclude<TurnFoot, "start" | null>; lines?: readonly ProgressLine[] }) {
  return (
    <div data-turn-line={foot} data-waiting={foot === "waiting" || undefined} className="-mt-3.5 ml-[42px] flex min-w-0 flex-col gap-1 text-[12px] text-muted">
      <p className="flex items-center gap-1.5">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full bg-accent", foot !== "waiting" && "animate-pulse")} />
        {WORDS[foot]}
      </p>
      {lines.map((line) => (
        <span key={line.who} className="flex min-w-0 items-center gap-1.5">
          <AgentFigure who={line.who} mood="working" glyph size={14} label="" className="shrink-0" />
          <span className="truncate">
            <span className="font-medium text-fg-2">{line.name}</span> · {line.text}
          </span>
        </span>
      ))}
    </div>
  );
}
