"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageBody, READING } from "@/components/page";
import { MemoryCapacity, MemoryGroupCard } from "@/components/settings/memory-list";
import { SETTINGS_COLUMN } from "@/components/settings/settings-rows";
import { Card, EmptyState, ErrorState, Meta, SkeletonRows } from "@/components/ui";
import { useMemories } from "@/lib/api/hooks";
import { groupMemories } from "@/lib/memory";

function Loading() {
  return (
    <Card>
      <SkeletonRows rows={4} />
    </Card>
  );
}

function MemoryScreen() {
  const memories = useMemories();
  // The activity log links here with the memory an entry is about.
  const highlightedId = useSearchParams().get("memory");
  const items = memories.data?.items ?? [];
  const asked = highlightedId !== null && memories.isSuccess && !items.some((memory) => memory.id === highlightedId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">What Tex remembers about you</h2>
        <p className={`text-[13.5px] text-muted ${READING}`}>
          Tex saves lasting facts you tell it: your preferences, the people and projects you mention, and standing instructions. Whichever AI runs
          Tex shares them. It never saves passwords or keys, and you can remove anything here.
        </p>
      </div>

      {memories.isPending ? (
        <Loading />
      ) : memories.isError ? (
        <ErrorState error={memories.error} onRetry={() => void memories.refetch()} />
      ) : (
        <>
          <MemoryCapacity count={items.length} max={memories.data.max} />

          {asked && (
            <p role="status" className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[13px] text-nav">
              That memory isn’t here any more. It was deleted, by you or by Tex when you asked it to forget.
            </p>
          )}

          {items.length === 0 ? (
            <EmptyState mood="asleep" title="Nothing saved yet">
              Tell Tex something worth keeping, like “remember that I prefer short replies”, and it shows up here.
            </EmptyState>
          ) : (
            // One kind under another, in the settings' one column.
            <div className="flex flex-col gap-6">
              {groupMemories(items).map((group) => (
                <MemoryGroupCard key={group.kind} group={group} highlightedId={highlightedId} />
              ))}
            </div>
          )}

          <Meta className={`text-[12px] ${READING}`}>
            There is nothing to add or edit here: tell Tex (“remember that…”, “that’s wrong, it’s…”). “Looked up” counts the times Tex searched its
            memory and found that fact.
          </Meta>
        </>
      )}
    </div>
  );
}

/** Settings → Memory: what Tex has saved about the person, by kind, with the ways to delete it. */
export default function MemoryPage() {
  return (
    <PageBody className={SETTINGS_COLUMN}>
      {/* Reads ?memory= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Loading />}>
        <MemoryScreen />
      </Suspense>
    </PageBody>
  );
}
