import Link from "next/link";
import { AgentFigure } from "../tex";

/** The Textcrew lockup, as on textcrew.in: Tex's face, the wordmark and the blinking cursor. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="Textcrew, home">
      <AgentFigure who="tex" glyph size={24} label="" />
      <span className="font-mono text-[16px] font-semibold tracking-[-0.03em]">textcrew</span>
      <span aria-hidden className="brand-caret -ml-1 h-[15px] w-[7px] bg-accent" />
    </Link>
  );
}
