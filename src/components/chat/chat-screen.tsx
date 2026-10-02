"use client";

import { Suspense, useRef, useState } from "react";
import type { ChannelType } from "@/lib/api/client";
import { CHANNEL_LABEL, cn } from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { Page, PageHeader } from "../page";
import { FilterPills, type FilterOption } from "../ui";
import { Composer, type ComposerHandle } from "./composer";
import { SidePanel } from "./side-panel";
import { Thread } from "./thread";

type Filter = ChannelType | "all";

const FILTERS: FilterOption<Filter>[] = [
  { value: "all", label: "All" },
  ...(["whatsapp", "telegram", "imessage", "web"] as const).map((channel) => ({
    value: channel,
    label: CHANNEL_LABEL[channel],
    icon: <BrandIcon name={channel} size={12} />,
  })),
];

/** Chat: the thread and composer in the middle, what's happening right now on the right. */
export function ChatScreen() {
  const [channel, setChannel] = useState<Filter>("all");
  const [dropping, setDropping] = useState(false);
  const composer = useRef<ComposerHandle>(null);

  return (
    <>
      <Page
        className={cn("relative", dropping && "bg-accent-soft/40")}
      >
        <PageHeader title="Chat">
          <FilterPills label="Filter by chat app" options={FILTERS} value={channel} onChange={setChannel} />
        </PageHeader>

        <div
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDropping(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            composer.current?.addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <Thread channel={channel} />
          <div className="shrink-0 px-3 pb-3 md:px-7 md:pb-3.5">
            <div className="mx-auto max-w-[704px]">
              {/* The composer reads ?draft= from the URL, which needs a Suspense boundary. */}
              <Suspense fallback={<div className="h-[66px]" />}>
                <Composer ref={composer} />
              </Suspense>
            </div>
          </div>
        </div>
      </Page>
      <SidePanel />
    </>
  );
}
