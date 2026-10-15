"use client";

import { useEffect, useState } from "react";
import { useAvailableChannels } from "@/lib/api/hooks";
import { ChannelPicker, LinkCodeBody, LinkWaiting, useChatLink } from "@/components/channels/link-code";
import { LockIcon } from "@/components/icons";
import { Button, Card, ErrorState, SectionLabel, SkeletonRows } from "@/components/ui";
import { linkableChannels, type LinkableChannel } from "@/lib/channels";
import { ChatPreview } from "./chat-preview";

/**
 * Step 1: send a one-time code from a chat app, and that chat becomes your agent.
 * Which chat apps are offered is the backend's call; `preferred` (from ?channel=) picks one of them.
 */
export function StepLink({ preferred, onDone, continueLabel = "Continue" }: { preferred?: string | null; onDone: () => void; continueLabel?: string }) {
  const available = useAvailableChannels();

  if (available.isPending) {
    return (
      <Card className="max-w-[620px]">
        <SkeletonRows rows={3} />
      </Card>
    );
  }
  if (available.isError) return <ErrorState error={available.error} onRetry={() => void available.refetch()} />;

  const options = linkableChannels(available.data);
  if (options.length === 0) return <NothingToLink onDone={onDone} continueLabel={continueLabel} />;
  return <LinkChat options={options} initial={options.find((option) => option === preferred) ?? options[0]} onDone={onDone} continueLabel={continueLabel} />;
}

/** Every chat app is switched off: say so, and let setup carry on with the web chat. */
function NothingToLink({ onDone, continueLabel }: { onDone: () => void; continueLabel: string }) {
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">No chat app to link right now</h1>
        <p className="max-w-[520px] text-[15px] text-muted">
          Chat apps are switched off at the moment. You can talk to Tex here in the web app, and link a chat later from Integrations.
        </p>
      </div>
      <Button variant="primary" size="lg" className="self-start" onClick={onDone}>
        {continueLabel}
      </Button>
    </div>
  );
}

function LinkChat({
  options,
  initial,
  onDone,
  continueLabel,
}: {
  options: LinkableChannel[];
  initial: LinkableChannel;
  onDone: () => void;
  continueLabel: string;
}) {
  const [picked, setPicked] = useState<LinkableChannel>(initial);
  // The list can change under an open page; never ask for a code for a channel that has gone.
  const channel = options.includes(picked) ? picked : options[0];
  const link = useChatLink(channel);
  const { code, expired, existing, fresh, name } = link;
  const several = options.length > 1;

  // The code arrived: move on without being asked.
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(timer);
  }, [fresh, onDone]);

  const pick = (next: LinkableChannel) => {
    if (next === channel) return;
    setPicked(next);
    link.reset();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-8 min-[940px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
              {several ? "Text Tex from the chat app you already use" : `Text Tex from ${name}`}
            </h1>
            <p className="max-w-[540px] text-[15px] text-muted">
              Link {several ? "your chat app" : `your ${name}`} and Tex is one message away on your phone. Send a one-time code from it; from then on,
              that chat is your agent, and what you say there shows up here too.
            </p>
          </div>

          {/* With one chat app on offer there is nothing to choose between. */}
          {several && <ChannelPicker options={options} value={channel} onPick={pick} />}

          <Card className="flex flex-col gap-4 p-5">
            <LinkCodeBody
              link={link}
              idle={
                <>
                  <SectionLabel as="span">Your one-time code</SectionLabel>
                  {existing && (
                    <p className="text-[13.5px]">
                      {name} is already linked as <span className="text-[12.5px]">{existing.displayId}</span>. You can link another or carry on.
                    </p>
                  )}
                  <p className="text-[14px] text-muted">We’ll make a code that works once and lasts 10 minutes.</p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button variant="primary" size="lg" pending={link.pending} onClick={link.getCode}>
                      Get my {name} code
                    </Button>
                    {existing && (
                      <Button size="lg" onClick={onDone}>
                        {continueLabel}
                      </Button>
                    )}
                  </div>
                </>
              }
            />
          </Card>

          <LinkWaiting link={link} arrives="This page moves on by itself once the code arrives." />
        </div>

        <ChatPreview channel={channel} code={code && !expired ? code.code : null} linked={Boolean(fresh)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="flex items-start gap-2.5 text-[13px] text-muted">
          <LockIcon size={16} className="mt-px shrink-0" />
          <span>A chat we don’t know only ever gets a “link your account” reply. Nothing reaches an agent until a chat is linked.</span>
        </p>
        {!fresh && (
          <Button variant="ghost" size="sm" onClick={onDone}>
            I’ll do this later
          </Button>
        )}
      </div>
    </div>
  );
}
