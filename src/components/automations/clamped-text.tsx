"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

// A text cut to a few lines, with "Show more" to read it all and "Show less" to fold it again. The
// button shows only when the text is in fact cut: it is measured, and measured again when the width
// changes (a phone turned, a panel opened).

export function ClampedText({ text, lines = 3, className }: { text: string; lines?: 2 | 3 | 4; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setCut(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open]);

  return (
    <>
      <p
        ref={ref}
        className={cn(
          "break-words whitespace-pre-line",
          !open && (lines === 2 ? "line-clamp-2" : lines === 4 ? "line-clamp-4" : "line-clamp-3"),
          className,
        )}
      >
        {text}
      </p>
      {(cut || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mt-1 self-start rounded text-[12.5px] font-medium text-accent hover:text-accent-dark"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}
