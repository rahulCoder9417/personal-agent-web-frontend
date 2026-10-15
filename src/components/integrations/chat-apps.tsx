"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/brand-icon";
import { LinkedChatRow, WebChatRow } from "@/components/channels/chat-rows";
import { ChannelPicker, LinkCodeBody, LinkWaiting, useChatLink } from "@/components/channels/link-code";
import { LockIcon } from "@/components/icons";
import { ChatPreview } from "@/components/onboarding/chat-preview";
import { PageBody } from "@/components/page";
import { toast } from "@/components/toast";
import { Button, Card, ErrorState, Meta, SectionLabel, SkeletonRows } from "@/components/ui";
import type { ChannelLink, ChannelType } from "@/lib/api/client";
import { useChannelList } from "@/lib/api/hooks";
import { linkableChannels, type LinkableChannel } from "@/lib/channels";
import { CHANNEL_LABEL, listNames } from "@/lib/format";
import { linkRequested } from "@/lib/integrations";
import { TabIntro } from "./intro";

/**
 * Integrations → Chat apps: the chats that are Tex (the web chat, and each linked chat with
 * Unlink), and for a chat app that isn't linked yet, linking it with a one-time code right here.
 * Which chat apps are on offer is the backend's call (`available` in `GET /v1/channels`).
 * `?link=telegram` picks which chat app to link when several are on offer.
 */
export function ChatAppsTab() {
  const channels = useChannelList();
  const params = useSearchParams();

  if (channels.isPending) {
    return (
      <PageBody>
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      </PageBody>
    );
  }
  if (channels.isError) {
    return (
      <PageBody>
        <ErrorState error={channels.error} onRetry={() => void channels.refetch()} />
      </PageBody>
    );
  }

  const links = channels.data.items.filter((link): link is ChannelLink & { channel: LinkableChannel } => link.channel !== "web");
  const linkable = linkableChannels(channels.data.available);
  return (
    <ChatApps
      links={links}
      linkable={linkable}
      available={channels.data.available}
      asked={linkRequested(params, linkable) as LinkableChannel | null}
    />
  );
}

function ChatApps({
  links,
  linkable,
  available,
  asked,
}: {
  links: (ChannelLink & { channel: LinkableChannel })[];
  linkable: LinkableChannel[];
  available: readonly ChannelType[];
  asked: LinkableChannel | null;
}) {
  const unlinked = linkable.filter((channel) => !links.some((link) => link.channel === channel));
  const [picked, setPicked] = useState<LinkableChannel | null>(asked);
  // The chat app to link: the one picked or asked for while it is still unlinked, else the first.
  const linking = unlinked.find((channel) => channel === picked) ?? unlinked[0];

  const intro = (
    <TabIntro title={linkable.length === 1 ? `Text Tex from ${CHANNEL_LABEL[linkable[0]]}` : "Text Tex from the chat app you already use"}>
      Link {linkable.length === 1 ? `your ${CHANNEL_LABEL[linkable[0]]}` : "a chat app"} and Tex is one message away on your phone. What you say there
      shows up in your chat history here too, and Tex answers where you wrote.
    </TabIntro>
  );

  // Nothing can be linked: every chat app is switched off here. A chat linked before stays listed.
  if (linkable.length === 0) {
    return (
      <PageBody>
        <TabIntro title="Chat apps">The chat apps you text Tex from. None can be linked right now.</TabIntro>
        <Card className="px-5 py-4 text-[13.5px] text-muted">
          Chat apps are switched off at the moment. You can talk to Tex here in the web app, and come back to link one later.
        </Card>
        <YourChats links={links} linkable={linkable} web={available.includes("web")} />
      </PageBody>
    );
  }

  // What the picture on the right shows: the chat app being linked, else the one linked.
  const shown = linking ?? links.find((link) => linkable.includes(link.channel))?.channel ?? linkable[0];
  return (
    <PageBody>
      <ChatAppsWith
        key={shown}
        shown={shown}
        linking={linking}
        unlinked={unlinked}
        links={links}
        linkable={linkable}
        web={available.includes("web")}
        intro={intro}
        onPick={setPicked}
      />
    </PageBody>
  );
}

function ChatAppsWith({
  shown,
  linking,
  unlinked,
  links,
  linkable,
  web,
  intro,
  onPick,
}: {
  shown: LinkableChannel;
  linking: LinkableChannel | undefined;
  unlinked: LinkableChannel[];
  links: ChannelLink[];
  linkable: LinkableChannel[];
  web: boolean;
  intro: ReactNode;
  onPick: (channel: LinkableChannel) => void;
}) {
  const link = useChatLink(shown);
  const { fresh, name } = link;
  const linkedHere = links.some((item) => item.channel === shown);

  // The code arrived: say so. The chat then shows under "Your chats", with Unlink, and the used code
  // is forgotten, so linking again after an unlink starts from a new one.
  const freshId = fresh?.id;
  const freshName = fresh?.displayId;
  const reset = link.reset;
  useEffect(() => {
    if (!freshId) return;
    toast({ title: `${name} is linked`, body: `Text Tex from ${freshName} any time. What you say there shows up here too.` });
    const timer = window.setTimeout(reset, 1500);
    return () => window.clearTimeout(timer);
  }, [freshId, freshName, name, reset]);

  return (
    <div className="grid items-start gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-7">
        {intro}

        {/* Not linked yet: the one-time code, right here. */}
        {linking && (
          <LinkSection
            link={link}
            options={unlinked}
            onPick={(channel) => {
              link.reset();
              onPick(channel);
            }}
          />
        )}

        <YourChats links={links} linkable={linkable} web={web} />

        <p className="flex items-start gap-2.5 border-t border-line pt-4 text-[13px] text-muted">
          <LockIcon size={16} className="mt-px shrink-0" />
          <span>A chat we don’t know only ever gets a “link your account” reply. Nothing reaches Tex until a chat is linked.</span>
        </p>
      </div>

      {/* A picture of what linking looks like from inside the chat app. A phone has the words above. */}
      <div className="max-[1100px]:hidden">
        <ChatPreview channel={shown} code={link.code && !link.expired ? link.code.code : null} linked={Boolean(fresh) || linkedHere} />
      </div>
    </div>
  );
}

/** Linking a chat app that isn't linked yet: ask for a code, send it, and it shows up as linked. */
function LinkSection({
  link,
  options,
  onPick,
}: {
  link: ReturnType<typeof useChatLink>;
  options: LinkableChannel[];
  onPick: (channel: LinkableChannel) => void;
}) {
  const titleId = useId();
  const { name, channel } = link;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <SectionLabel>
        <span id={titleId}>{options.length > 1 ? "Link a chat app" : `Link ${name}`}</span>
      </SectionLabel>
      {options.length > 1 && <ChannelPicker options={options} value={channel} onPick={onPick} />}
      <Card className="flex flex-col gap-4 p-5 max-sm:p-4">
        <LinkCodeBody
          link={link}
          idle={
            <>
              <div className="flex items-center gap-3">
                <AppIcon name={channel} size={40} />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold">{name} isn’t linked yet</span>
                  <Meta className="text-[12.5px]">Takes a minute: one code, one message.</Meta>
                </div>
              </div>
              <p className="text-[14px] text-muted">
                We’ll make a code that works once and lasts 10 minutes. Send it to Textcrew on {name}, and from then on that chat is Tex.
              </p>
              <Button variant="primary" size="lg" className="self-start max-sm:w-full" pending={link.pending} onClick={link.getCode}>
                Get my {name} code
              </Button>
            </>
          }
        />
      </Card>
      <LinkWaiting link={link} arrives="This page updates by itself once the code arrives." />
    </section>
  );
}

/** The chats that are Tex: each linked chat (with Unlink), and the web chat. */
function YourChats({ links, linkable, web }: { links: ChannelLink[]; linkable: readonly LinkableChannel[]; web: boolean }) {
  const titleId = useId();
  const names = links.map((link) => CHANNEL_LABEL[link.channel]);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionLabel>
          <span id={titleId}>Your chats</span>
        </SectionLabel>
        <Meta className="text-[12px]">
          {links.length === 0 ? "No chat app linked yet" : `${listNames([...new Set(names)], "and")} linked`}
        </Meta>
      </div>
      <Card>
        <ul>
          {links.map((link) => (
            <LinkedChatRow key={link.id} link={link} off={!linkable.some((channel) => channel === link.channel)} />
          ))}
          {web && <WebChatRow />}
        </ul>
      </Card>
      <Meta className="text-[12px]">Any of these is Tex. Messages from all of them land in one chat history.</Meta>
    </section>
  );
}
