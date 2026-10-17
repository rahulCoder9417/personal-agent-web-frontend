"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChannelType } from "@/lib/api/client";
import { prefetchThread, useAvailableChannels, useConversations, useNewChat, usePinnedAutomations } from "@/lib/api/hooks";
import { useAutomationsUnread } from "@/lib/automations-seen";
import { linkableChannels } from "@/lib/channels";
import { allConversations, anyUnread, AUTOMATIONS_TITLE, canWriteIn, conversationToOpen, isAutomationsChat, newChatError, readOnlyNote, titleOf } from "@/lib/conversations";
import { CHANNEL_LABEL, cn, listNames } from "@/lib/format";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { PANEL_MOTION, useMotionReady, useStaysDrawn } from "@/lib/motion";
import { currentAccount, openedChatHere } from "@/lib/onboarded-here";
import { focusAfterToggle, PANELS } from "@/lib/panels";
import { useReadWhileShown } from "@/lib/read-while-shown";
import { useStoredFlag } from "@/lib/stored-flag";
import { BrandIcon } from "../brand-icon";
import { AutomationsIcon, CloseIcon, NewChatIcon, PanelIcon } from "../icons";
import { Page } from "../page";
import { useAppConfig } from "../shell/providers";
import { toast } from "../toast";
import { ErrorState, IconButton } from "../ui";
import { Composer, type ComposerHandle } from "./composer";
import { ConversationPanel } from "./conversation-panel";
import { FoldingPane } from "./folding-pane";
import { SidePanel, SidePanelReopen } from "./side-panel";
import { AutomationsWaiting, Thread } from "./thread";

const CHATS_ID = "chat-history";
const HIDE_CHATS_ID = "chats-hide";
const SHOW_CHATS_ID = "chats-show";

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
 * `/?chat=automations` (the Automations screen's link, and the last line of a run's copy on
 * Telegram) opens the Automations chat; `/?conversation=<id>` (the link in a Telegram notice, such
 * as "Byte finished") opens that conversation. Read once, then the address is tidied. Reading the
 * address needs a Suspense boundary.
 */
function OpenFromLink({ onAutomations, onConversation }: { onAutomations: () => void; onConversation: (id: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const wanted = params.get("chat") === "automations";
  const conversation = params.get("conversation");
  useEffect(() => {
    if (!wanted && !conversation) return;
    if (wanted) onAutomations();
    else if (conversation) onConversation(conversation);
    router.replace("/");
  }, [wanted, conversation, onAutomations, onConversation, router]);
  return null;
}

/**
 * The list of chats on a phone or a narrow window: a drawer from the left, over the screen. A
 * native dialog, so the page behind it can't be reached, Escape and a tap beside it close it, and
 * the keyboard goes back to the button that opened it. It slides in over a dimmed page and slides
 * back out as the page brightens (`.drawer` in globals.css); what is in it stays until it has gone.
 */
function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drawn = useStaysDrawn(open);
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
      className="drawer fixed inset-y-0 right-auto left-0 z-50 m-0 h-dvh max-h-none w-[min(320px,86vw)] max-w-none border-0 bg-surface p-0 pb-[env(safe-area-inset-bottom,0px)] text-fg shadow-[var(--shadow-pop)]"
    >
      {drawn && children}
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
 * away; below that it is a drawer opened from the header. The side panel on the right folds away
 * too. Both slide rather than jump, and this browser remembers which are folded (`PANELS`).
 */
export function ChatScreen() {
  const available = useAvailableChannels().data;
  // Until the backend has said otherwise, web chat is taken to be on: it nearly always is.
  const webChatOn = available === undefined || available.includes("web");

  // The chat that opened by itself on the last visit: its messages are asked for beside the list of
  // chats instead of after it, which saves one wait for the database before it shows (`openedChatHere`).
  const qc = useQueryClient();
  const { mode } = useAppConfig();
  useEffect(() => {
    const remembered = openedChatHere.get(currentAccount(mode));
    if (remembered) void prefetchThread(qc, remembered);
  }, [qc, mode]);

  const list = useConversations();
  // Asked for (its pinned row, or the address `?chat=automations`): the Automations chat, once it is
  // known, until another conversation is picked.
  const [wantAutomations, setWantAutomations] = useState(false);
  const pinned = usePinnedAutomations(wantAutomations);
  const automationsChat = pinned.chat;
  // The dated list, then the Automations chat (pinned apart in the history, but opened like any).
  const dated = useMemo(() => allConversations(list.data).filter((conversation) => !isAutomationsChat(conversation)), [list.data]);
  const conversations = useMemo(() => (automationsChat ? [...dated, automationsChat] : dated), [dated, automationsChat]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = pickedId ?? (wantAutomations ? (automationsChat?.id ?? null) : null);
  // Asked for before the backend has started it: its stand-in, which says what will come. Once
  // the backend starts it (a run, or a new automation), the real one opens in its place.
  const standIn = wantAutomations && automationsChat === null ? pinned.waiting : null;
  const lookingForIt = wantAutomations && automationsChat === null && pinned.pending;
  const opened = standIn || lookingForIt ? null : conversationToOpen(conversations, picked, webChatOn);
  const writable = webChatOn && canWriteIn(opened) && !standIn;
  const inAutomations = standIn !== null || isAutomationsChat(opened);
  const automationsUnread = useAutomationsUnread(automationsChat, inAutomations);
  // Noted for the next visit: the chat that opens by itself (nothing picked), once the list has said which.
  const openedByItself = pickedId === null && !wantAutomations && list.isSuccess ? (opened?.id ?? null) : null;
  useEffect(() => {
    if (openedByItself) openedChatHere.set(currentAccount(mode), openedByItself);
  }, [mode, openedByItself]);
  // The one on screen is being read: opening it, and each reply that arrives while it is shown, marks it read.
  useReadWhileShown(opened?.id ?? null, opened?.unread === true);
  // Something from Tex not seen yet in another chat: the button that shows the list says so while it is put away.
  const chatsUnread = anyUnread(dated, opened?.id ?? null);

  const wide = useMediaQuery(SHOWN_AT.conversations);
  const hidden = useStoredFlag(PANELS.chats);
  const panelHidden = useStoredFlag(PANELS.sidePanel);
  const motion = useMotionReady();
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
    setWantAutomations(false);
    setDrawer(false);
  };
  const openLinked = useCallback(
    (conversationId: string) => {
      setPickedId(conversationId);
      setWantAutomations(false);
      setDrawer(false);
    },
    [setDrawer],
  );
  const openAutomations = useCallback(() => {
    setPickedId(null);
    setWantAutomations(true);
    setDrawer(false);
  }, [setDrawer]);
  const startNewChat = () =>
    newChat.mutate(undefined, {
      onSuccess: (conversation) => {
        open(conversation.id);
        setStarted((count) => count + 1);
      },
      onError: (error) => toast({ title: "Couldn’t start a new chat", body: newChatError(error) }),
    });

  const panel = (dismiss: ReactNode) => (
    <ConversationPanel
      openId={opened?.id ?? null}
      canStart={webChatOn}
      starting={newChat.isPending}
      automationsOpen={inAutomations}
      automationsUnread={automationsUnread}
      onOpen={open}
      onOpenAutomations={openAutomations}
      onNewChat={startNewChat}
      dismiss={dismiss}
    />
  );
  // On a wide screen the header's own buttons are needed only while the column is folded away.
  // They fade and fold as the column comes and goes (in a wrapper, so the button keeps its own
  // hover transition and its focus ring).
  const headerOnly = cn("flex max-w-9 shrink-0", motion && cn("transition-[max-width,margin,opacity,visibility]", PANEL_MOTION), !hidden && "lg:invisible lg:max-w-0 lg:opacity-0");

  return (
    <>
      {/* The column keeps its place on a wide screen until the browser has said how wide it is. */}
      <FoldingPane
        id={CHATS_ID}
        label="Chat history"
        side="left"
        width="w-[264px]"
        open={!hidden}
        motion={motion}
        className="max-lg:hidden"
        innerClassName="border-r border-line"
      >
        {wide &&
          panel(
            <IconButton
              id={HIDE_CHATS_ID}
              label="Hide chats"
              aria-controls={CHATS_ID}
              aria-expanded
              onClick={(event) => {
                PANELS.chats.set(true);
                focusAfterToggle(event.currentTarget, SHOW_CHATS_ID);
              }}
            >
              <PanelIcon size={17} />
            </IconButton>,
          )}
      </FoldingPane>

      <Page className={cn("relative", dropping && "bg-accent-soft/40")}>
        <header className="flex shrink-0 items-center gap-1.5 px-2.5 pt-3 pb-2 md:min-h-[60px] md:px-5 md:pt-4">
          {/* Folded away, it gives back the gap beside it too. */}
          <span className={cn(headerOnly, !hidden && "lg:-mr-1.5")}>
            <IconButton
              id={SHOW_CHATS_ID}
              label={chatsUnread ? "Show chats (unread messages)" : automationsUnread ? "Show chats (new automation runs)" : "Show chats"}
              aria-controls={wide ? CHATS_ID : undefined}
              aria-haspopup={wide ? undefined : "dialog"}
              aria-expanded={wide ? false : drawer}
              onClick={(event) => {
                if (!wide) return setDrawer(true);
                PANELS.chats.set(false);
                focusAfterToggle(event.currentTarget, HIDE_CHATS_ID);
              }}
              className="relative size-9"
            >
              <PanelIcon size={18} />
              {/* Something from Tex arrived in another chat, or a run in the Automations chat, while the history is put away. */}
              {(chatsUnread || automationsUnread) && (
                <span data-unread aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-surface" />
              )}
            </IconButton>
          </span>
          {inAutomations && (
            <span aria-hidden className="ml-1 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <AutomationsIcon size={15} />
            </span>
          )}
          <h1 className="min-w-0 truncate px-1.5 text-[19px] leading-tight font-semibold tracking-[-0.02em]">
            {opened ? titleOf(opened) : standIn ? AUTOMATIONS_TITLE : "Chat"}
          </h1>
          {opened && opened.channel !== "web" && (
            <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-[12px] font-medium text-nav">
              <BrandIcon name={opened.channel} size={12} />
              {CHANNEL_LABEL[opened.channel]}
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center">
            {webChatOn && (
              <span className={headerOnly}>
                <IconButton label="New chat" disabled={newChat.isPending} onClick={startNewChat} className="size-9">
                  <NewChatIcon size={18} />
                </IconButton>
              </span>
            )}
            <SidePanelReopen besideChats={!hidden} hidden={panelHidden} motion={motion} onShow={() => PANELS.sidePanel.set(false)} />
          </div>
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
          ) : standIn ? (
            <AutomationsWaiting automations={standIn} />
          ) : (
            // Its own Thread for each conversation, so each opens at its newest message.
            <Thread
              key={opened?.id ?? "none"}
              conversation={opened}
              loading={list.isPending || lookingForIt}
              hasHistory={conversations.length > (opened ? 1 : 0)}
            />
          )}
          <div className="shrink-0 px-3 pb-3 md:px-7 md:pb-3.5">
            <div className="mx-auto max-w-[888px]">
              {standIn ? (
                <p role="note" className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-[18px] py-3.5 text-[13.5px] text-nav">
                  <AutomationsIcon size={16} className="shrink-0" />
                  You can follow up here once the first run has arrived.
                </p>
              ) : opened && !canWriteIn(opened) ? (
                <ReadOnly channel={opened.channel} />
              ) : !webChatOn ? (
                <WebChatOff elsewhere={linkableChannels(available ?? []).map((item) => CHANNEL_LABEL[item])} />
              ) : (
                // The composer reads ?draft= from the URL, which needs a Suspense boundary.
                <Suspense fallback={<div className="h-[66px]" />}>
                  <Composer ref={composer} conversationId={opened?.id} placeholder={inAutomations ? "Follow up on a run…" : undefined} />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </Page>

      <SidePanel besideChats={!hidden} hidden={panelHidden} motion={motion} onHide={() => PANELS.sidePanel.set(true)} />

      <Suspense fallback={null}>
        <OpenFromLink onAutomations={openAutomations} onConversation={openLinked} />
      </Suspense>

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
