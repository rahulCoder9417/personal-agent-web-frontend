"use client";

import { useEffect, useRef } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, InlineError, Meta, SectionLabel } from "@/components/ui";
import { ApiError, type Memory } from "@/lib/api/client";
import { useDeleteAllMemories, useDeleteMemory } from "@/lib/api/hooks";
import { cn, formatNumber } from "@/lib/format";
import { describeMemorySaved, describeMemoryUse, memoryCapacity, type MemoryGroup } from "@/lib/memory";

/** One saved fact: its text, when it was saved and looked up, and the only thing the app can do with it. */
function MemoryRow({ memory, highlighted }: { memory: Memory; highlighted: boolean }) {
  const remove = useDeleteMemory();
  const row = useRef<HTMLLIElement>(null);
  // A memory that was already gone (404) is not worth an error: the list is asked again and drops it.
  const gone = remove.error instanceof ApiError && remove.error.status === 404;

  // Opened from the activity log on this memory: bring it into view.
  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: "center" });
  }, [highlighted]);

  return (
    <li
      ref={row}
      id={`memory-${memory.id}`}
      className={cn("flex flex-col gap-1.5 border-b border-line px-5 py-3.5 last:border-b-0", highlighted && "bg-accent-soft")}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] break-words">{memory.content}</span>
          <Meta className="text-[12px]">
            {describeMemorySaved(memory)} · {describeMemoryUse(memory)}
          </Meta>
        </div>
        <ConfirmButton
          label="Delete"
          confirmLabel="Delete memory"
          ariaLabel={`Delete the memory “${memory.content}”`}
          pending={remove.isPending}
          onConfirm={() => remove.mutate(memory.id)}
        />
      </div>
      {!gone && <InlineError error={remove.error} />}
    </li>
  );
}

/** The memories of one kind, under the kind's name. */
export function MemoryGroupCard({ group, highlightedId }: { group: MemoryGroup; highlightedId: string | null }) {
  return (
    <section aria-label={group.label} className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <SectionLabel>{group.label}</SectionLabel>
        <Meta className="text-[12px]">{group.items.length}</Meta>
      </div>
      <Card className="overflow-hidden">
        <ul>
          {group.items.map((memory) => (
            <MemoryRow key={memory.id} memory={memory} highlighted={memory.id === highlightedId} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** How much of the memory is used, and the way to empty it. Deleting everything asks once more first. */
export function MemoryCapacity({ count, max }: { count: number; max: number }) {
  const clear = useDeleteAllMemories();
  const capacity = memoryCapacity(count, max);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex w-[170px] flex-col gap-[5px]">
          <span className="text-[12px] text-nav">{capacity.text}</span>
          <span
            role="progressbar"
            aria-label="Memory used"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={Math.min(count, max)}
            className="block h-1 rounded-sm bg-line"
          >
            <span className={cn("block h-1 rounded-sm", capacity.full ? "bg-danger" : "bg-fg")} style={{ width: `${capacity.percent}%` }} />
          </span>
        </div>
        {count > 0 && (
          <ConfirmButton
            className="ml-auto"
            label="Delete all"
            confirmLabel={`Delete all ${formatNumber(count)} ${count === 1 ? "memory" : "memories"}`}
            ariaLabel="Delete every memory"
            pending={clear.isPending}
            onConfirm={() => clear.mutate()}
          />
        )}
      </div>
      {capacity.full && (
        <p role="status" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          Memory is full. Tex can’t save anything new until you delete some.
        </p>
      )}
      {clear.isSuccess && count === 0 && (
        <p role="status" className="text-[12.5px] text-muted">
          Deleted {formatNumber(clear.data.deleted)} {clear.data.deleted === 1 ? "memory" : "memories"}. Tex starts again with nothing saved about you.
        </p>
      )}
      <InlineError error={clear.error} />
    </div>
  );
}
