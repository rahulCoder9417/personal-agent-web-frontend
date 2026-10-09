"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChannelType } from "@/lib/api/client";
import { useAvailableChannels, useConversations, useNewChat } from "@/lib/api/hooks";
import { linkableChannels } from "@/lib/channels";
import { allConversations, canWriteIn, conversationToOpen, newChatError, readOnlyNote, titleOf } from "@/lib/conversations";
import { CHANNEL_LABEL, cn, listNames } from "@/lib/format";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { storedFlag, useStoredFlag } from "@/lib/stored-flag";
import { BrandIcon } from "../brand-icon";
import { CloseIcon, NewChatIcon, PanelIcon } from "../icons";
import { Page } from "../page";
import { toast } from "../toast";
import { ErrorState, IconButton } from "../ui";
import { Composer, type ComposerHandle } from "./composer";
import { ConversationPanel } from "./conversation-panel";
import { SidePanel } from "./side-panel";
import { Thread } from "./thread";

/** Whether the person folded the list of chats away on a wide screen. This browser remembers it. */
const chatsHidden = storedFlag("textcrew.chats.hidden");

/** Shown in place of the composer when the backend has web chat switched off. */
function WebChatOff({ elsewhere }: { elsewhere: string[] }) {
  return (
    <p role="status" className="rounded-2xl bg-surface px-[18px] py-3.5 text-[13.5px] text-muted shadow-[0_0_0_1px_var(--line-strong)]">
      <span className="font-semibold text-fg">Web chat is switched off right now.</span>{" "}
      {elsewhere.length > 0 ? `Text Tex on ${listNames(elsewhere)} instead; the conversation still shows up here.` : "Your earlier conversations are still here."}
    </p>
  );
}

/** Shown in place of the composer under a conversation of another chat app: it is read here, answered there. */
function ReadOnly({ channel }: { channel: ChannelType }) {
  return (
    <p role="note" className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-[18px] py-3.5 text-[13.5px] text-nav">
      <BrandIcon name={channel} size={16} />
      {readOnlyNote(channel)}.
    </p>
  );
}

/**
 * The list of chats on a phone or a narrow window: a drawer from the left, over the screen. A
 * native dialog, so the page behind it can't be reached, Escape and a tap beside it close it, and
 * the keyboard goes back to the button that opened it.
 */
function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label="Chats"
      onClose={onClose}
      onClick={(event) => {
        // A tap on the dimmed page lands on the dialog itself, not on anything in it.
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(320px,86vw)] max-w-none border-0 bg-surface p-0 pb-[env(safe-area-inset-bottom,0px)] text-fg shadow-[var(--shadow-pop)] transition-transform duration-200 ease-out backdrop:bg-fg/30 motion-reduce:transition-none starting:open:-translate-x-full"
    >
      {open && children}
    </dialog>
  );
}

/**
 * Chat: the history on the left, the open conversation's thread and the composer in the middle,
 * what's happening right now on the right.
 *
 * The thread shows one conversation: the one picked from the history, or the active web
 * conversation, where a message from here is written. Each has its own context for Tex. A web
 * conversation can be written in (which makes it the active one); another chat app's is read here
 * and answered there. From 1024px the history is a column beside the thread that can be folded
 * away; below that it is a drawer opened from the header.
 */
export function ChatScreen() {
  const available = useAvailableChannels().data;
  // Until the backend has said otherwise, web chat is taken to be on: it nearly always is.
  const webChatOn = available === undefined || available.includes("web");

  const list = useConversations();
  const conversations = useMemo(() => allConversations(list.data), [list.data]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const opened = conversationToOpen(conversations, pickedId, webChatOn);
  const writable = webChatOn && canWriteIn(opened);

  const wide = useMediaQuery(SHOWN_AT.conversations);
  const hidden = useStoredFlag(chatsHidden);
  const [drawer, setDrawer] = useState(false);

  const newChat = useNewChat();
  const composer = useRef<ComposerHandle>(null);
  const [dropping, setDropping] = useState(false);
  // Counts the new chats started, so the composer is given the keyboard after each (and after the
  // drawer has closed, which would otherwise hand the keyboard back to the button that opened it).
  const [started, setStarted] = useState(0);
  useEffect(() => {
    if (started > 0) composer.current?.focus();
  }, [started]);

  const open = (conversationId: string) => {
    setPickedId(conversationId);
    setDrawer(false);
  };
  const startNewChat = () =>
    newChat.mutate(undefined, {
      onSuccess: (conversation) => {
        open(conversation.id);
        setStarted((count) => count + 1);
      },
      onError: (error) => toast({ title: "Couldn’t start a new chat", body: newChatError(error) }),
    });

  const panel = (dismiss: ReactNode) => (
    <ConversationPanel openId={opened?.id ?? null} canStart={webChatOn} starting={newChat.isPending} onOpen={open} onNewChat={startNewChat} dismiss={dismiss} />
  );
  // On a wide screen the header's own buttons are needed only while the column is folded away.
  const headerOnly = cn(!hidden && "lg:hidden");

  return (
    <>
      {/* The column keeps its place on a wide screen until the browser has said how wide it is. */}
      {!hidden && (
        <aside aria-label="Chat history" className="w-[264px] shrink-0 border-r border-line max-lg:hidden">
          {wide &&
            panel(
              <IconButton label="Hide chats" onClick={() => chatsHidden.set(true)}>
                <PanelIcon size={17} />
              </IconButton>,
            )}
        </aside>
      )}

      <Page className={cn("relative", dropping && "bg-accent-soft/40")}>
        <header className="flex shrink-0 items-center gap-1.5 px-2.5 pt-3 pb-2 md:min-h-[60px] md:px-5 md:pt-4">
          <IconButton label="Show chats" onClick={() => (wide ? chatsHidden.set(false) : setDrawer(true))} className={cn("size-9", headerOnly)}>
            <PanelIcon size={18} />
          </IconButton>
          <h1 className="min-w-0 truncate px-1.5 text-[19px] leading-tight font-semibold tracking-[-0.02em]">{opened ? titleOf(opened) : "Chat"}</h1>
          {opened && opened.channel !== "web" && (
            <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-[12px] font-medium text-nav">
              <BrandIcon name={opened.channel} size={12} />
              {CHANNEL_LABEL[opened.channel]}
            </span>
          )}
          {webChatOn && (
            <IconButton label="New chat" disabled={newChat.isPending} onClick={startNewChat} className={cn("ml-auto size-9", headerOnly)}>
              <NewChatIcon size={18} />
            </IconButton>
          )}
        </header>

        <div
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files") && writable) {
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
          {list.isError && !list.data ? (
            <div className="scroll-pane flex min-h-0 flex-1 overflow-y-auto">
              <ErrorState error={list.error} onRetry={() => list.refetch()} className="m-auto w-full" />
            </div>
          ) : (
            // Its own Thread for each conversation, so each opens at its newest message.
            <Thread key={opened?.id ?? "none"} conversation={opened} loading={list.isPending} hasHistory={conversations.length > (opened ? 1 : 0)} />
          )}
          <div className="shrink-0 px-3 pb-3 md:px-7 md:pb-3.5">
            <div className="mx-auto max-w-[704px]">
              {opened && !canWriteIn(opened) ? (
                <ReadOnly channel={opened.channel} />
              ) : !webChatOn ? (
                <WebChatOff elsewhere={linkableChannels(available ?? []).map((item) => CHANNEL_LABEL[item])} />
              ) : (
                // The composer reads ?draft= from the URL, which needs a Suspense boundary.
                <Suspense fallback={<div className="h-[66px]" />}>
                  <Composer ref={composer} conversationId={opened?.id} />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </Page>

      <SidePanel besideChats={!hidden} />

      <Drawer open={drawer && !wide} onClose={() => setDrawer(false)}>
        {panel(
          <IconButton label="Close" onClick={() => setDrawer(false)}>
            <CloseIcon size={17} />
          </IconButton>,
        )}
      </Drawer>
    </>
  );
}
