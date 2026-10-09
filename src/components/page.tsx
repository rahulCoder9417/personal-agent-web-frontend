import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/** A screen on the sheet: a header that stays put and a body that scrolls. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>{children}</div>;
}

/** The screen's name, large, with its controls on the same line. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2.5 px-4 pt-4 pb-3 md:min-h-[68px] md:px-8 md:pt-5">
      <h1 className="text-[21px] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap">{title}</h1>
      {children}
    </header>
  );
}

/**
 * Scrolling body. It takes the whole width of the sheet, from the header's left edge to the
 * right edge: lists, tables and card grids fill it, with as many columns as fit. Text that is
 * read rather than scanned keeps a comfortable line with `READING` on the paragraph; the page
 * itself is never narrowed.
 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="scroll-pane min-h-0 flex-1 overflow-y-auto">
      <div className={cn("flex flex-col gap-7 px-4 pt-2 pb-10 md:px-8", className)}>{children}</div>
    </div>
  );
}

/** The longest line that still reads well, for a paragraph on a full-width page. */
export const READING = "max-w-[72ch]";

/**
 * Cards of different heights, in as many columns as fit (at least `min` wide each), filled top
 * to bottom so no row is left half empty. Give each child `COLUMN_ITEM`.
 */
export function Columns({ min = 420, className, children }: { min?: number; className?: string; children: ReactNode }) {
  return (
    // The gap under each card is padding (a margin is dropped at the foot of a column); the
    // negative margin takes back the last one, so what follows sits at the page's own gap.
    <div className={cn("-mb-6 gap-x-7", className)} style={{ columnWidth: min }}>
      {children}
    </div>
  );
}

/** Keeps a card in one piece inside `Columns`, with the gap below it. */
export const COLUMN_ITEM = "break-inside-avoid pb-6";
