"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import type { ChannelType } from "@/lib/api/client";
import { useAvailableChannels, useChannels, useMessages } from "@/lib/api/hooks";
import { channelsToShow, linkableChannels, listNames } from "@/lib/channels";
import { CHANNEL_LABEL, cn } from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { Page, PageHeader } from "../page";
import { FilterPills, type FilterOption } from "../ui";
import { Composer, type ComposerHandle } from "./composer";
import { SidePanel } from "./side-panel";
import { Thread } from "./thread";

type Filter = ChannelType | "all";

/**
 * The channels to filter by: the ones that are switched on, plus any that are off but still
 * have a linked chat or messages here, so an old conversation can still be picked out.
 */
function useChannelFilters(): FilterOption<Filter>[] {
  const available = useAvailableChannels().data;
  const links = useChannels().data;
  const messages = useMessages("all").data;

  return useMemo(() => {
    const seen = [
      ...(links ?? []).map((link) => link.channel),
      ...(messages?.pages.flatMap((page) => page.items.map((message) => message.channel)) ?? []),
    ];
    const channels = channelsToShow(available ?? [], seen);
    // One channel is the same thread as "All": no filter to offer.
    if (channels.length < 2) return [];
    return [
      { value: "all", label: "All" },
      ...channels.map((channel) => ({
        value: channel,
        label: CHANNEL_LABEL[channel],
        icon: <BrandIcon name={channel} size={12} />,
      })),
    ];
  }, [available, links, messages]);
}

/** Shown in place of the composer when the backend has web chat switched off. */
function WebChatOff({ elsewhere }: { elsewhere: string[] }) {
  return (
    <p role="status" className="rounded-2xl bg-surface px-[18px] py-3.5 text-[13.5px] text-muted shadow-[0_0_0_1px_var(--line-strong)]">
      <span className="font-semibold text-fg">Web chat is switched off right now.</span>{" "}
      {elsewhere.length > 0 ? `Text Tex on ${listNames(elsewhere)} instead; the conversation still shows up here.` : "Your earlier conversation is still here."}
    </p>
  );
}

/** Chat: the thread and composer in the middle, what's happening right now on the right. */
export function ChatScreen() {
  const [channel, setChannel] = useState<Filter>("all");
  const [dropping, setDropping] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const filters = useChannelFilters();
  const available = useAvailableChannels().data;
  const webChatOff = available !== undefined && !available.includes("web");

  return (
    <>
      <Page
        className={cn("relative", dropping && "bg-accent-soft/40")}
      >
        <PageHeader title="Chat">
          {filters.length > 0 && <FilterPills label="Filter by chat app" options={filters} value={channel} onChange={setChannel} />}
        </PageHeader>

        <div
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files") && !webChatOff) {
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
              {webChatOff ? (
                <WebChatOff elsewhere={linkableChannels(available).map((item) => CHANNEL_LABEL[item])} />
              ) : (
                // The composer reads ?draft= from the URL, which needs a Suspense boundary.
                <Suspense fallback={<div className="h-[66px]" />}>
                  <Composer ref={composer} />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </Page>
      <SidePanel />
    </>
  );
}
