import Link from "next/link";
import { cn } from "@/lib/format";
import { AgentFigure } from "../tex";

/**
 * The Textcrew lockup, as on textcrew.in: Tex's face, the wordmark and the blinking cursor.
 * `onColour` is the lockup on the brand blue (the sign-in panel): Tex's face, drawn in that blue,
 * sits on a white tile, and the wordmark and the cursor are white.
 */
export function Brand({ href = "/", onColour = false }: { href?: string; onColour?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2", onColour && "gap-2.5 text-white")} aria-label="Textcrew, home">
      {onColour ? (
        <span className="grid size-8 place-items-center rounded-[9px] bg-surface shadow-[0_1px_2px_rgb(21_21_21/0.25)]">
          <AgentFigure who="tex" glyph size={22} label="" />
        </span>
      ) : (
        <AgentFigure who="tex" glyph size={24} label="" />
      )}
      <span className="font-mono text-[16px] font-semibold tracking-[-0.03em]">textcrew</span>
      <span aria-hidden className={cn("brand-caret -ml-1 h-[15px] w-[7px]", onColour ? "bg-surface" : "bg-accent")} />
    </Link>
  );
}
