import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { PANEL_MOTION } from "@/lib/motion";

/**
 * A column at the side of the chat that folds away: its width closes to nothing while what is in
 * it slides out with the closing edge and fades. Folded, it is inert and hidden from screen
 * readers, so the keyboard never lands in it. What is inside keeps its width (`width`), so nothing
 * in it wraps afresh as it moves.
 *
 * `side` is the side of the thread it is on. `motion` is false until the page has been drawn once
 * (`useMotionReady`), so a panel the browser remembers as folded doesn't slide shut on every load.
 * `className` and `innerClassName` add to the column and to what slides inside it (a border, the
 * widths at which there is no room for it).
 */
export function FoldingPane({
  id,
  label,
  side,
  width,
  open,
  motion,
  className,
  innerClassName,
  children,
}: {
  id?: string;
  label: string;
  side: "left" | "right";
  /** The open width, as a whole Tailwind class (`w-[264px]`), so Tailwind finds it. */
  width: string;
  open: boolean;
  motion: boolean;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <aside
      id={id}
      aria-label={label}
      aria-hidden={open ? undefined : true}
      inert={!open}
      data-open={open || undefined}
      className={cn(
        // The contents ride the edge that moves: the right edge of a column on the left, the left edge of one on the right.
        "flex shrink-0 overflow-clip",
        side === "left" ? "justify-end" : "justify-start",
        motion && cn("transition-[width,visibility]", PANEL_MOTION),
        open ? width : "invisible w-0",
        className,
      )}
    >
      <div
        className={cn(
          "h-full shrink-0",
          width,
          motion && cn("transition-[opacity,translate]", PANEL_MOTION),
          !open && cn("opacity-0", side === "left" ? "-translate-x-3" : "translate-x-3"),
          innerClassName,
        )}
      >
        {children}
      </div>
    </aside>
  );
}
