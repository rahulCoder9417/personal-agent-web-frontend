import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automation, Conversation } from "@/lib/api/client";

// The chat history with the Automations chat pinned above the dated list.

const at = (hhmm: string) => `2026-10-08T${hhmm}:00.000Z`;
const conversation = (id: string, title: string, rest: Partial<Conversation> = {}): Conversation => ({
  id,
  channel: "web",
  kind: "chat",
  epoch: 0,
  startedAt: at("08:00"),
  lastMessageAt: at("09:00"),
  title,
  active: false,
  ...rest,
});

const state = vi.hoisted(() => ({ automations: null as Conversation | null, waiting: null as Automation[] | null, chats: [] as Conversation[] }));

vi.mock("@/lib/api/hooks", () => ({
  useConversations: () => ({
    data: { pages: [{ items: state.chats, nextCursor: null }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    fetchNextPage: () => {},
  }),
  usePinnedAutomations: () => ({ chat: state.automations, waiting: state.waiting, pending: false }),
  useRenameConversation: () => ({ mutate: () => {}, isPending: false }),
  useDeleteConversation: () => ({ mutate: () => {}, isPending: false }),
}));

import { ConversationPanel } from "./conversation-panel";

const draw = (props: { openId?: string | null; unread?: boolean; automationsOpen?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(ConversationPanel, {
      openId: props.openId ?? null,
      canStart: true,
      starting: false,
      automationsOpen: props.automationsOpen ?? false,
      automationsUnread: props.unread ?? false,
      onOpen: () => {},
      onOpenAutomations: () => {},
      onNewChat: () => {},
      dismiss: null,
    }),
  );
/** What sits between "New chat" and the dated list, and the dated list itself. */
const pinnedPart = (html: string) => /<div data-automations-chat[^]*?<\/div><\/div>/.exec(html)?.[0] ?? "";
const datedPart = (html: string) => /<nav aria-label="Chats"[^]*<\/nav>/.exec(html)?.[0] ?? "";

beforeEach(() => {
  state.waiting = null;
  state.automations = conversation("cnv_auto", "Automations", { kind: "automations", lastMessageAt: at("12:00") });
  state.chats = [conversation("cnv_a", "Plan a trip to Goa", { active: true, lastMessageAt: at("11:00") }), conversation("cnv_b", "Laptop")];
});

describe("ConversationPanel with the Automations chat", () => {
  it("pins it above the dated list, with its own icon, and leaves it out of the list", () => {
    const html = draw();
    const pinned = pinnedPart(html);
    expect(pinned).toContain("Automations");
    expect(pinned).toContain("bg-accent-soft");
    expect(html.indexOf("New chat")).toBeLessThan(html.indexOf("data-automations-chat"));
    expect(html.indexOf("data-automations-chat")).toBeLessThan(html.indexOf('aria-label="Chats"'));
    const dated = datedPart(html);
    expect(dated).toContain("Plan a trip to Goa");
    expect(dated).not.toContain(">Automations<");
    // Even when a list from the server carried it, it is not one of the dated rows.
    state.chats = [state.automations!, ...state.chats];
    expect(datedPart(draw())).not.toContain(">Automations<");
  });

  it("offers no menu on the Automations chat: it can't be renamed or deleted", () => {
    const html = draw({ openId: "cnv_auto" });
    const pinned = pinnedPart(html);
    expect(pinned).toContain(">Automations<");
    expect(pinned).not.toContain("Options for");
    expect(pinned).not.toContain("data-menu-toggle");
    expect(html).not.toContain("Options for Automations");
    expect(html).not.toContain("Delete the Automations chat");
    // The other chats keep theirs.
    expect(datedPart(html)).toContain('aria-label="Options for Plan a trip to Goa"');
  });

  it("shows the unread mark only when told, and says so to a screen reader", () => {
    expect(pinnedPart(draw())).not.toContain("data-unread");
    const unread = pinnedPart(draw({ unread: true }));
    expect(unread).toContain("data-unread");
    expect(unread).toContain('aria-label="Automations, new runs"');
  });

  it("marks it as the open one, and is not there while there is no Automations chat and no automation", () => {
    expect(pinnedPart(draw({ openId: "cnv_auto" }))).toContain('aria-current="true"');
    expect(pinnedPart(draw({ automationsOpen: true }))).toContain('aria-current="true"');
    state.automations = null;
    expect(draw()).not.toContain("data-automations-chat");
  });

  it("stands in for an Automations chat the backend hasn't started yet, while there are automations", () => {
    state.automations = null;
    state.waiting = [{ id: "aut_1", kind: "repeat", title: "Today’s meetings", instruction: "i", enabled: true, createdAt: at("07:00") }];
    const pinned = pinnedPart(draw());
    expect(pinned).toContain(">Automations<");
    expect(pinned).toContain("No runs yet");
    expect(pinned).toContain('aria-label="Automations"');
    // No menu, as on the real one.
    expect(pinned).not.toContain("Options for");
    expect(pinnedPart(draw({ automationsOpen: true }))).toContain('aria-current="true"');
  });
});
