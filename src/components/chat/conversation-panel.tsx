"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, errorMessage, type Conversation } from "@/lib/api/client";
import { useAutomationsChat, useConversations, useDeleteConversation, useRenameConversation } from "@/lib/api/hooks";
import { allConversations, isAutomationsChat, lastSpokenAt, TITLE_MAX, titleOf, titleToSave } from "@/lib/conversations";
import { CHANNEL_LABEL, cn, formatAgo } from "@/lib/format";
import { useInView } from "@/lib/in-view";
import { usePresence } from "@/lib/motion";
import { BrandIcon } from "../brand-icon";
import { AutomationsIcon, MoreIcon, NewChatIcon, PencilIcon, TrashIcon } from "../icons";
import { toast } from "../toast";
import { Button, Spinner } from "../ui";

/** The time, kept fresh once a minute, so "5 min ago" doesn't stay on screen for an hour. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

type MenuState = { id: string; up: boolean };

const conversationKey = (conversation: Conversation) => conversation.id;

/**
 * What can be done with one conversation: rename it, or delete it after asking once more.
 * It closes on Escape and on a click anywhere else.
 */
function RowMenu({
  conversation,
  up,
  deleting,
  onRename,
  onDelete,
  onClose,
}: {
  conversation: Conversation;
  up: boolean;
  deleting: boolean;
  onRename: () => void;
  onDelete: () => void;
  onClose: (refocus: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  // The Automations chat keeps its name: it can only be deleted.
  const pinned = isAutomationsChat(conversation);

  useEffect(() => {
    const first = menu.current?.querySelector<HTMLElement>("button");
    first?.focus();
  }, [confirming]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // The row's own button opens and closes the menu itself.
      if (menu.current?.contains(target) || target?.closest("[data-menu-toggle]")) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      // In a drawer, Escape closes this and not the drawer with it.
      event.preventDefault();
      onClose(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("button") ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
    event.preventDefault();
    next?.focus();
  };

  const item = "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors";
  return (
    <div
      ref={menu}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute right-1 z-20 w-[212px] rounded-xl bg-surface p-1 shadow-[var(--shadow-pop)] ring-1 ring-line-strong",
        up ? "bottom-full mb-0.5" : "top-full mt-0.5",
      )}
    >
      {confirming ? (
        <div role="alertdialog" aria-label={`Delete ${titleOf(conversation)}?`} className="flex flex-col gap-2 p-2">
          <p className="text-[13.5px] font-semibold">{pinned ? "Delete the Automations chat?" : "Delete this chat?"}</p>
          <p className="text-[12.5px] text-muted">
            {pinned
              ? "Every run in it is deleted too. Your automations keep running, and the next run starts it again."
              : "Its messages and files are deleted too. This can’t be undone."}
          </p>
          <div className="flex justify-end gap-1.5 pt-0.5">
            <Button size="sm" variant="ghost" disabled={deleting} onClick={() => onClose(true)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" pending={deleting} onClick={onDelete} className="bg-danger-soft">
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div role="menu" aria-label={`Options for ${titleOf(conversation)}`}>
          {!pinned && (
            <button type="button" role="menuitem" onClick={onRename} className={cn(item, "hover:bg-surface-2")}>
              <PencilIcon size={15} className="text-muted" />
              Rename
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => setConfirming(true)} className={cn(item, "text-danger hover:bg-danger-soft")}>
            <TrashIcon size={15} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/** The row's name as a field: Enter or leaving it saves, Escape leaves it as it was. */
function RenameField({ conversation, onSave, onCancel }: { conversation: Conversation; onSave: (typed: string) => void; onCancel: () => void }) {
  // Enter saves and then the field loses focus as it goes away: only the first of the two counts.
  const done = useRef(false);
  const finish = (typed: string | null) => {
    if (done.current) return;
    done.current = true;
    if (typed === null) onCancel();
    else onSave(typed);
  };
  return (
    <form
      className="flex items-center rounded-[9px] bg-surface-2 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        finish(new FormData(event.currentTarget).get("title")?.toString() ?? "");
      }}
    >
      <input
        name="title"
        aria-label={`New name for ${titleOf(conversation)}`}
        defaultValue={titleOf(conversation)}
        maxLength={TITLE_MAX}
        autoFocus
        autoComplete="off"
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          event.preventDefault();
          finish(null);
        }}
        className="h-8 w-full min-w-0 rounded-md border border-accent bg-surface px-2 text-[13.5px] outline-none"
      />
    </form>
  );
}

function Row({
  conversation,
  entering,
  leaving,
  open,
  now,
  menu,
  renaming,
  deleting,
  onOpen,
  onMenu,
  onRename,
  onSaveName,
  onDelete,
}: {
  conversation: Conversation;
  /** It has just been added: it fades and slides in. */
  entering: boolean;
  /** It has just gone (deleted here or elsewhere): it fades and folds shut, and can't be reached. */
  leaving: boolean;
  open: boolean;
  now: Date;
  menu: MenuState | null;
  renaming: boolean;
  deleting: boolean;
  onOpen: () => void;
  onMenu: (state: MenuState | null) => void;
  onRename: (on: boolean) => void;
  onSaveName: (typed: string) => void;
  onDelete: () => void;
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  const title = titleOf(conversation);
  const elsewhere = conversation.channel !== "web";
  const menuOpen = !leaving && menu?.id === conversation.id;

  if (renaming && !leaving) {
    return (
      <li>
        <RenameField conversation={conversation} onSave={onSaveName} onCancel={() => onRename(false)} />
      </li>
    );
  }

  return (
    <li
      inert={leaving}
      aria-hidden={leaving || undefined}
      className={cn(
        // A row of one track that can close to nothing, so a row that goes folds shut and the rows below close up smoothly.
        "group relative grid grid-cols-1 transition-[grid-template-rows,opacity,translate] duration-200 ease-out motion-reduce:transition-none",
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
        entering && "starting:-translate-y-1.5 starting:opacity-0",
      )}
    >
      <div className={cn("relative min-h-0", leaving && "overflow-hidden")}>
        <button
          type="button"
          aria-current={open ? "true" : undefined}
          onClick={onOpen}
          className={cn(
            "flex w-full flex-col gap-px rounded-[9px] py-[7px] pr-9 pl-2.5 text-left transition-colors",
            open ? "bg-surface-2" : "hover:bg-surface-2/70",
          )}
        >
          <span className={cn("w-full truncate text-[13.5px]", open ? "font-semibold text-fg" : "font-medium text-fg-2")}>{title}</span>
          <span className="flex w-full items-center gap-1.5 text-[12px] text-muted tabular-nums">
            {elsewhere && (
              <>
                <BrandIcon name={conversation.channel} size={11} />
                <span>{CHANNEL_LABEL[conversation.channel]} ·</span>
              </>
            )}
            <span className="truncate">{formatAgo(lastSpokenAt(conversation), now)}</span>
          </span>
        </button>
        <button
          ref={toggle}
          type="button"
          data-menu-toggle
          aria-label={`Options for ${title}`}
          title="Rename or delete"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            if (menuOpen) return onMenu(null);
            // Open upwards when the row is near the bottom of the list, where a menu below would be cut off.
            const pane = event.currentTarget.closest("[data-chats-pane]");
            const room = (pane?.getBoundingClientRect().bottom ?? window.innerHeight) - event.currentTarget.getBoundingClientRect().bottom;
            onMenu({ id: conversation.id, up: room < 170 });
          }}
          className={cn(
            "absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted transition-[opacity,background-color,color] hover:bg-line hover:text-fg",
            // Always there on a touch screen and on the open row; elsewhere it shows with the pointer or the keyboard.
            !(menuOpen || open) && "group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0",
          )}
        >
          <MoreIcon size={16} />
        </button>
      </div>
      {menuOpen && (
        <RowMenu
          conversation={conversation}
          up={menu.up}
          deleting={deleting}
          onRename={() => onRename(true)}
          onDelete={onDelete}
          onClose={(refocus) => {
            onMenu(null);
            if (refocus) toggle.current?.focus();
          }}
        />
      )}
    </li>
  );
}

/**
 * The Automations chat, pinned above the dated list with its own icon: every run of every
 * automation answers there. A dot says something new arrived in it since it was last open. Its menu
 * only deletes it (it keeps its name).
 */
function AutomationsRow({
  conversation,
  open,
  unread,
  now,
  menu,
  deleting,
  onOpen,
  onMenu,
  onDelete,
}: {
  conversation: Conversation;
  open: boolean;
  unread: boolean;
  now: Date;
  menu: MenuState | null;
  deleting: boolean;
  onOpen: () => void;
  onMenu: (state: MenuState | null) => void;
  onDelete: () => void;
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  const menuOpen = menu?.id === conversation.id;
  const ran = conversation.lastMessageAt !== conversation.startedAt;
  return (
    <div className="group relative">
      <button
        type="button"
        aria-current={open ? "true" : undefined}
        aria-label={`${titleOf(conversation)}${unread ? ", new runs" : ""}`}
        onClick={onOpen}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[9px] py-[7px] pr-9 pl-2 text-left transition-colors",
          open ? "bg-surface-2" : "hover:bg-surface-2/70",
        )}
      >
        <span aria-hidden className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <AutomationsIcon size={16} />
          {unread && <span data-unread className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className={cn("w-full truncate text-[13.5px]", open || unread ? "font-semibold text-fg" : "font-medium text-fg-2")}>
            {titleOf(conversation)}
          </span>
          <span className="w-full truncate text-[12px] text-muted tabular-nums">
            {ran ? formatAgo(lastSpokenAt(conversation), now) : "No runs yet"}
          </span>
        </span>
      </button>
      <button
        ref={toggle}
        type="button"
        data-menu-toggle
        aria-label={`Options for ${titleOf(conversation)}`}
        title="Delete"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => onMenu(menuOpen ? null : { id: conversation.id, up: false })}
        className={cn(
          "absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted transition-[opacity,background-color,color] hover:bg-line hover:text-fg",
          !(menuOpen || open) && "group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0",
        )}
      >
        <MoreIcon size={16} />
      </button>
      {menuOpen && (
        <RowMenu
          conversation={conversation}
          up={false}
          deleting={deleting}
          onRename={() => {}}
          onDelete={onDelete}
          onClose={(refocus) => {
            onMenu(null);
            if (refocus) toggle.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function Loading() {
  return (
    <div aria-hidden className="flex flex-col gap-3 px-2.5 pt-2">
      {[70, 52, 84, 60].map((width) => (
        <span key={width} className="flex flex-col gap-1.5">
          <span className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${width}%` }} />
          <span className="h-2.5 w-1/4 animate-pulse rounded bg-surface-2" />
        </span>
      ))}
    </div>
  );
}

/**
 * The chat history: every conversation, the one something was last said in first, with "New chat"
 * above them. Each row opens its conversation, and its menu renames or deletes it. Further pages
 * are asked for as the list is scrolled to its end. On a wide screen this is the column beside the
 * thread; on a phone it is the drawer.
 *
 * `openId` is the conversation the thread shows. `dismiss` is the button that puts the list away
 * ("Hide chats" for the column, "Close" for the drawer).
 */
export function ConversationPanel({
  openId,
  canStart,
  starting,
  automationsUnread = false,
  onOpen,
  onNewChat,
  dismiss,
}: {
  openId: string | null;
  /** Web chat is switched on, so a new chat can be started. */
  canStart: boolean;
  starting: boolean;
  /** Something arrived in the Automations chat since it was last open. */
  automationsUnread?: boolean;
  onOpen: (conversationId: string) => void;
  onNewChat: () => void;
  dismiss: ReactNode;
}) {
  const list = useConversations();
  const automations = useAutomationsChat().data ?? null;
  // The dated list: the Automations chat is pinned above it instead.
  const conversations = useMemo(() => allConversations(list.data).filter((conversation) => !isAutomationsChat(conversation)), [list.data]);
  // What has just gone stays a moment, to fold shut where it was.
  const rows = usePresence(conversations, conversationKey);
  const rename = useRenameConversation();
  const remove = useDeleteConversation();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const now = useNow();

  const end = useRef<HTMLDivElement>(null);
  useInView(end, () => void list.fetchNextPage(), list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError);

  const saveName = (conversation: Conversation, typed: string) => {
    setRenaming(null);
    const title = titleToSave(typed, titleOf(conversation));
    if (title === null) return;
    rename.mutate(
      { conversationId: conversation.id, title },
      { onError: (error) => toast({ title: "Couldn’t rename that chat", body: errorMessage(error) }) },
    );
  };

  const deleteIt = (conversation: Conversation) =>
    remove.mutate(conversation.id, {
      onSuccess: () => toast({ title: "Chat deleted" }),
      onError: (error) =>
        error instanceof ApiError && error.status === 404
          ? toast({ title: "That chat was already deleted" })
          : toast({ title: "Couldn’t delete that chat", body: errorMessage(error) }),
      onSettled: () => setMenu(null),
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 pt-3.5 pr-2 pb-2 pl-4">
        <h2 className="flex-1 text-[13px] font-semibold">Chats</h2>
        {dismiss}
      </div>
      {canStart && (
        <div className="shrink-0 px-2.5 pb-2">
          <Button className="w-full justify-start" pending={starting} onClick={onNewChat}>
            {!starting && <NewChatIcon size={15} />}
            New chat
          </Button>
        </div>
      )}
      {automations && (
        <div data-automations-chat className="shrink-0 border-b border-line px-1.5 pb-2">
          <AutomationsRow
            conversation={automations}
            open={automations.id === openId}
            unread={automationsUnread}
            now={now}
            menu={menu}
            deleting={remove.isPending && remove.variables === automations.id}
            onOpen={() => onOpen(automations.id)}
            onMenu={setMenu}
            onDelete={() => deleteIt(automations)}
          />
        </div>
      )}

      <nav aria-label="Chats" data-chats-pane className={cn("scroll-pane min-h-0 flex-1 overflow-y-auto px-1.5 pb-3", automations && "pt-2")}>
        {list.isPending && <Loading />}
        {list.isError && !list.data && (
          <div role="alert" className="flex flex-col items-start gap-2 px-2.5 pt-2 text-[13px] text-muted">
            <p>Your chats didn’t load. {errorMessage(list.error)}</p>
            <Button size="sm" onClick={() => list.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {list.isSuccess && conversations.length === 0 && (
          <p className="px-2.5 pt-2 text-[13px] text-muted">No chats yet. Say something to Tex and it shows up here.</p>
        )}

        <ul className="flex flex-col gap-px">
          {rows.map(({ item: conversation, entering, leaving }) => (
            <Row
              key={conversation.id}
              conversation={conversation}
              entering={entering}
              leaving={leaving}
              open={conversation.id === openId}
              now={now}
              menu={menu}
              renaming={renaming === conversation.id}
              deleting={remove.isPending && remove.variables === conversation.id}
              onOpen={() => onOpen(conversation.id)}
              onMenu={setMenu}
              onRename={(on) => {
                setMenu(null);
                setRenaming(on ? conversation.id : null);
              }}
              onSaveName={(typed) => saveName(conversation, typed)}
              onDelete={() => deleteIt(conversation)}
            />
          ))}
        </ul>

        {list.hasNextPage && (
          <div ref={end} className="flex min-h-9 items-center justify-center pt-1 text-muted">
            {list.isFetchNextPageError ? (
              <Button size="sm" variant="ghost" onClick={() => void list.fetchNextPage()}>
                Couldn’t load more. Try again
              </Button>
            ) : (
              <Spinner size={14} />
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
