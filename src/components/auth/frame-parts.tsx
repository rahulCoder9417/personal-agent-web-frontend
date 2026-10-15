import type { CSSProperties } from "react";
import { AgentFigure, type AgentId } from "@/components/tex";
import { cn } from "@/lib/format";

// The pieces the sign-in pages' looks share: the crew, their colours and faces.

/** Each member's own colour, from the design tokens, as on the crew page. */
export const CREW_COLOUR: Record<AgentId, string> = { tex: "var(--accent)", byte: "var(--byte)", patch: "var(--patch)", scout: "var(--scout)" };

/** A member's colour, mixed into another one (a soft tile on white, a glow on the dark). */
export const tint = (id: AgentId, strength: number, into = "var(--surface)") => `color-mix(in srgb, ${CREW_COLOUR[id]} ${strength}%, ${into})`;

export const CREW: readonly { id: AgentId; name: string; role: string }[] = [
  { id: "tex", name: "Tex", role: "captain" },
  { id: "byte", name: "Byte", role: "code" },
  { id: "patch", name: "Patch", role: "code review" },
  { id: "scout", name: "Scout", role: "research" },
];

/** A face in a round tile of its own colour. */
export function Face({ id, size = 22, className, style }: { id: AgentId; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full", className)} style={{ background: tint(id, 16), width: size, height: size, ...style }}>
      <AgentFigure who={id} glyph size={Math.round(size * 0.72)} label="" />
    </span>
  );
}

/** The line from textcrew.in, as the page's headline. `crew` styles the last words. */
export function Headline({ className, crewClassName }: { className?: string; crewClassName?: string }) {
  return (
    <h2 className={className}>
      Got a lot of work?
      <br />
      Just text <span className={crewClassName}>your crew.</span>
    </h2>
  );
}

export const PITCH = "Send one message. Tex, your captain, hands each part to the right specialist and checks with you before anything risky.";
