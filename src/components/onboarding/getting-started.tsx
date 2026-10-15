"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useAgentSettings, useApps, useAutomations, useChannelList, useConversations, useMe, useUpdateOnboarding } from "@/lib/api/hooks";
import { allConversations } from "@/lib/conversations";
import { cn } from "@/lib/format";
import { type ChecklistItem, checklistAllowed, checklistItems, checklistProgress, showChecklist } from "@/lib/onboarding";
import { CheckIcon, CloseIcon } from "../icons";
import { toastError } from "../toast";
import { buttonClass, IconButton } from "../ui";

export type GettingStarted = {
  /** The steps, once everything they are worked out from has loaded. */
  items: ChecklistItem[] | null;
  visible: boolean;
  hide: () => void;
};

/**
 * The "Getting started" checklist's state. Whether the person hid it is kept on the account
 * (`gettingStartedDismissedAt`); whether each step is done comes from the API: the agent settings,
 * the linked chats, the apps, the chat history and the automations. None of that is asked for while
 * `enabled` is false or once it was hidden. Hiding it is shown at once and saved; if the save fails
 * it comes back, with a toast.
 */
export function useGettingStarted(enabled = true): GettingStarted {
  const me = useMe();
  const update = useUpdateOnboarding();
  const asking = enabled && checklistAllowed(me.data);

  const settings = useAgentSettings(asking);
  const channels = useChannelList(asking);
  const apps = useApps(asking);
  const conversations = useConversations(asking);
  const automations = useAutomations({ enabled: asking });

  const items = useMemo(() => {
    if (!settings.data || !channels.data || !apps.data || !conversations.data || !automations.data) return null;
    return checklistItems({
      settings: settings.data,
      channels: channels.data,
      apps: apps.data,
      conversations: allConversations(conversations.data),
      automations: automations.data,
    });
  }, [settings.data, channels.data, apps.data, conversations.data, automations.data]);

  return {
    items,
    visible: asking && showChecklist(items, me.data),
    hide: () =>
      update.mutate(
        { gettingStartedDismissed: true },
        { onError: (error) => toastError("Couldn’t hide the checklist", error) },
      ),
  };
}

/** How far along: "2 of 5 done" and a bar. */
function Progress({ items, className }: { items: readonly ChecklistItem[]; className?: string }) {
  const { done, total } = checklistProgress(items);
  return (
    <div
      role="progressbar"
      aria-label="Steps done"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} of ${total} done`}
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className="h-full rounded-full bg-success transition-[width] duration-500 ease-out" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
    </div>
  );
}

/** A step's mark: a tick once done, else an empty ring (in the accent for the step to do next). */
function Mark({ done, next }: { done: boolean; next: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-px grid size-[22px] shrink-0 place-items-center rounded-full",
        done ? "bg-success-soft text-success" : next ? "border-[1.5px] border-accent bg-accent-soft" : "border-[1.5px] border-line-strong",
      )}
    >
      {done && <CheckIcon size={12} strokeWidth={2.5} />}
    </span>
  );
}

/**
 * The steps, one per row: done ones say what was set up, the others say what they are for and have
 * a button to do them. The first one left is the one to do next, and its button stands out.
 * `onGo` runs as a button is followed (the sidebar closes its popover).
 */
function Steps({ items, compact = false, onGo }: { items: readonly ChecklistItem[]; compact?: boolean; onGo?: () => void }) {
  const next = items.find((item) => !item.done && !item.optional) ?? items.find((item) => !item.done);
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const isNext = item === next;
        return (
          <li key={item.id} className={cn("flex items-start gap-3 border-t border-line", compact ? "px-4 py-2.5" : "px-5 py-3")}>
            <Mark done={item.done} next={isNext} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("flex flex-wrap items-baseline gap-x-2 text-[13.5px] leading-snug", item.done ? "text-fg-2" : "font-semibold")}>
                {item.title}
                {item.optional && !item.done && <span className="text-[11.5px] font-normal text-muted">Optional</span>}
              </span>
              {item.done ? (
                <span className="truncate text-[12.5px] text-muted">{item.doneNote}</span>
              ) : (
                <span className="text-[12.5px] leading-snug text-muted">{item.body}</span>
              )}
            </div>
            {!item.done && (
              <Link
                href={item.href}
                onClick={onGo}
                aria-label={`${item.action}: ${item.title}`}
                className={buttonClass(isNext ? "primary" : "secondary", "sm", "mt-px min-w-[72px]")}
              >
                {item.action}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Header({ items, onHide, compact = false, titleId }: { items: readonly ChecklistItem[]; onHide: () => void; compact?: boolean; titleId: string }) {
  const { done, total } = checklistProgress(items);
  return (
    <div className={cn("flex flex-col gap-2.5", compact ? "px-4 pt-3.5 pb-3" : "px-5 pt-4 pb-3.5")}>
      <div className="flex items-center gap-2">
        <h2 id={titleId} className="flex-1 text-[14.5px] font-semibold tracking-[-0.01em]">
          Getting started
        </h2>
        <span className="text-[12.5px] text-muted tabular-nums">
          {done} of {total} done
        </span>
        <IconButton label="Hide getting started" onClick={onHide} className="-mr-1.5">
          <CloseIcon size={15} />
        </IconButton>
      </div>
      <Progress items={items} />
    </div>
  );
}

/** The way to the Help page, at the foot of the checklist. `onGo` closes the sidebar's popover. */
function HelpFoot({ onGo, className, children }: { onGo?: () => void; className?: string; children?: ReactNode }) {
  return (
    <p className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line text-[12px] text-muted", className)}>
      {children}
      <Link href="/help" onClick={onGo} className="font-medium text-accent hover:text-accent-dark">
        How Textcrew works
      </Link>
    </p>
  );
}

// How many full checklists are on screen: while one is (an empty chat), the sidebar's card steps
// aside, so the checklist is never shown twice.
let cardsOnScreen = 0;
const cardListeners = new Set<() => void>();
const subscribeToCards = (listener: () => void) => {
  cardListeners.add(listener);
  return () => cardListeners.delete(listener);
};
function useCardOnScreen(on: boolean) {
  useEffect(() => {
    if (!on) return;
    cardsOnScreen += 1;
    cardListeners.forEach((listener) => listener());
    return () => {
      cardsOnScreen -= 1;
      cardListeners.forEach((listener) => listener());
    };
  }, [on]);
}
const useCardShown = () => useSyncExternalStore(subscribeToCards, () => cardsOnScreen > 0, () => false);

/**
 * The checklist as a card: in the chat while a conversation is empty, and at the top of More on a
 * phone. Draws nothing once it is done or hidden.
 */
export function GettingStartedCard({ setup, className }: { setup: GettingStarted; className?: string }) {
  const titleId = useId();
  const shown = setup.visible && setup.items !== null;
  useCardOnScreen(shown);
  if (!shown || !setup.items) return null;
  return (
    <section aria-labelledby={titleId} className={cn("overflow-hidden rounded-xl border border-line bg-surface text-left shadow-[var(--shadow-soft)]", className)}>
      <Header items={setup.items} onHide={setup.hide} titleId={titleId} />
      <Steps items={setup.items} />
      <HelpFoot className="bg-surface-2/60 px-5 py-2.5">
        <span>It goes away once the main steps are done. Hidden, it can be brought back in Settings.</span>
      </HelpFoot>
    </section>
  );
}

/** A ring that fills as steps get done, with the count inside: the checklist on the folded sidebar. */
function Ring({ items, size = 30 }: { items: readonly ChecklistItem[]; size?: number }) {
  const { done, total } = checklistProgress(items);
  const r = size / 2 - 2.5;
  const length = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--success)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${(done / Math.max(total, 1)) * length} ${length}`}
        />
      </svg>
      <span className="absolute text-[10.5px] font-semibold tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}

const POPOVER_WIDTH = 360;

/**
 * The checklist in the sidebar: a card above the credits (a ring on the folded rail) that opens the
 * whole list beside the sidebar. It steps aside while the chat shows the whole checklist itself. The list is a popover, so a click elsewhere or Escape closes it,
 * as does following one of its buttons. Nothing is asked for while the sidebar isn't on screen
 * (`shown`), and nothing is drawn once the checklist is done or hidden.
 */
export function GettingStartedNav({ shown, fade, railOnly }: { shown: boolean; fade: string; railOnly: string }) {
  const setup = useGettingStarted(shown);
  const cardShown = useCardShown();
  const popoverId = useId();
  const titleId = useId();
  const popover = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLButtonElement>(null);
  const tile = useRef<HTMLButtonElement>(null);

  // Placed as it opens: beside the sidebar, its foot level with the button that opened it.
  useEffect(() => {
    const element = popover.current;
    if (!element) return;
    const place = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const trigger = [card.current, tile.current].find((button) => button && button.getBoundingClientRect().width > 0 && getComputedStyle(button).visibility !== "hidden");
      const nav = element.closest("nav");
      if (!trigger || !nav) return;
      const left = nav.getBoundingClientRect().right + 6;
      element.style.left = `${Math.round(left)}px`;
      element.style.bottom = `${Math.round(Math.max(8, window.innerHeight - trigger.getBoundingClientRect().bottom))}px`;
      element.style.width = `${Math.min(POPOVER_WIDTH, window.innerWidth - left - 12)}px`;
    };
    element.addEventListener("beforetoggle", place);
    return () => element.removeEventListener("beforetoggle", place);
  });

  if (!setup.visible || !setup.items || cardShown) return null;
  const items = setup.items;
  const { done, total } = checklistProgress(items);
  const next = items.find((item) => !item.done && !item.optional) ?? items.find((item) => !item.done);
  const close = () => popover.current?.hidePopover();

  return (
    <>
      {/* The card and the rail's tile share a place, like the credits below; one fades as the other comes. */}
      <div className="grid items-end">
        <div className={cn("min-w-[216px] [grid-area:1/1] group-data-[collapsed]/nav:invisible", fade)}>
          <button
            ref={card}
            type="button"
            popoverTarget={popoverId}
            aria-haspopup="dialog"
            className="flex w-full flex-col gap-2 rounded-xl bg-surface px-3 py-2.5 text-left shadow-[var(--shadow-raised)] transition-shadow hover:shadow-[var(--shadow-soft)]"
          >
            <span className="flex items-center justify-between text-[12.5px] font-semibold">
              Getting started
              <span className="text-[12px] font-normal text-muted tabular-nums">
                {done} of {total}
              </span>
            </span>
            <Progress items={items} />
            {next && <span className="truncate text-[12px] text-muted">Next: {next.title}</span>}
          </button>
        </div>
        {/* Over the card's lower half: only the tile itself takes a click, so the card's whole face does. */}
        <div className="pointer-events-none [grid-area:1/1]">
          <button
            ref={tile}
            type="button"
            popoverTarget={popoverId}
            aria-haspopup="dialog"
            aria-label={`Getting started, ${done} of ${total} done`}
            title={`Getting started · ${done} of ${total} done`}
            className={cn(
              "pointer-events-auto invisible grid size-10 place-items-center rounded-xl bg-surface shadow-[var(--shadow-raised)] transition-shadow hover:shadow-[var(--shadow-soft)] group-data-[collapsed]/nav:visible",
              railOnly,
            )}
          >
            <Ring items={items} />
          </button>
        </div>
      </div>

      <div
        ref={popover}
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        className="fixed inset-auto m-0 max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-fg shadow-[var(--shadow-pop)]"
      >
        <Header items={items} onHide={setup.hide} compact titleId={titleId} />
        <Steps items={items} compact onGo={close} />
        <HelpFoot onGo={close} className="px-4 py-2.5" />
      </div>
    </>
  );
}
