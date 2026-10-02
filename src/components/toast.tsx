"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/format";
import { CheckIcon, CloseIcon } from "./icons";

// Short confirmations that something finished elsewhere (a payment landing, for instance).

type Toast = { id: number; title: string; body?: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Shows a confirmation in the corner of the page for a few seconds. */
export function toast(message: { title: string; body?: string }) {
  const id = nextId++;
  toasts = [...toasts, { id, ...message }];
  emit();
  window.setTimeout(() => dismiss(id), 8000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const none: Toast[] = [];

export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => none,
  );
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[320px] flex-col gap-2 max-md:inset-x-4 max-md:bottom-[76px] max-md:w-auto" role="status" aria-live="polite">
      {list.map((item) => (
        <div
          key={item.id}
          className={cn("pointer-events-auto flex items-start gap-3 rounded-2xl border border-fg-2 bg-surface px-4 py-3 shadow-[var(--shadow-pop)]")}
        >
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
            <CheckIcon size={12} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13.5px] font-semibold">{item.title}</span>
            {item.body && <span className="text-[13px] text-muted">{item.body}</span>}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(item.id)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
            <CloseIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
