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

/** Scrolling body. Content keeps to the header's left edge, at a readable width. */
export function PageBody({
  children,
  width = 1000,
  className,
}: {
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <div className="scroll-pane min-h-0 flex-1 overflow-y-auto">
      <div className={cn("flex flex-col gap-7 px-4 pt-2 pb-10 md:px-8", className)} style={{ maxWidth: width + 64 }}>
        {children}
      </div>
    </div>
  );
}
