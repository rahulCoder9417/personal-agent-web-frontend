"use client";

import {
  type InfiniteData,
  type MutationOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  api,
  ApiError,
  unwrap,
  type AgentRuntime,
  type AgentSettings,
  type AgentStatus,
  type AgentSettingsUpdate,
  type AiPreference,
  type Approval,
  type ApprovalStatus,
  type Attachment,
  type Automation,
  type ByokProvider,
  type ChannelType,
  type Conversation,
  type McpServerCreate,
  type Me,
  type MeUpdate,
  type Message,
  type PlanId,
} from "./client";
import {
  allConversations,
  automationsChatIn,
  automationsChatSpoke,
  changeConversation,
  conversationSpoke,
  conversationStartedBy,
  dropConversation,
  emptyActiveChat,
  isAutomationsChat,
  placeConversation,
  readMarked,
  serverHasAutomationsChat,
  type ConversationList,
} from "../conversations";
import type { ProgressLine } from "../crew";

// One place for every query key, so the event stream and mutations invalidate the same things.
export const qk = {
  me: ["me"] as const,
  channels: ["channels"] as const,
  conversations: ["conversations"] as const,
  /** The Automations chat, pinned apart (under `conversations`, so refreshing the list refreshes it too). */
  automationsChat: ["conversations", "automations"] as const,
  /** One conversation's messages. */
  thread: (conversationId: string) => ["messages", conversationId] as const,
  approvals: (status: ApprovalStatus = "pending") => ["approvals", status] as const,
  apps: ["apps"] as const,
  mcpServers: ["mcp-servers"] as const,
  byok: ["byok"] as const,
  automations: ["automations"] as const,
  prReviews: ["pr-reviews"] as const,
  agentStatus: ["agent", "status"] as const,
  agentSettings: ["agent", "settings"] as const,
  agentProgress: ["agent", "progress"] as const,
  crew: ["crew"] as const,
  memories: ["memories"] as const,
  plans: ["billing", "plans"] as const,
  subscription: ["billing", "subscription"] as const,
  credits: ["credits"] as const,
  ledger: ["credits", "ledger"] as const,
  usage: (from: string, to: string) => ["usage", from, to] as const,
  activity: ["activity"] as const,
};

const PAGE = 30;
type Page<T> = { items: T[]; nextCursor: string | null };

// ---------------------------------------------------------------- me

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => unwrap(api.GET("/v1/me")) });
}

const updateMe = (body: MeUpdate): Promise<Me> => unwrap(api.PATCH("/v1/me", { body }));

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<MeUpdate, "name" | "timezone">) => updateMe(body),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

/**
 * The welcome flow finished or skipped (`onboardingCompleted`), or the "Getting started" checklist
 * hidden (`gettingStartedDismissed`); false undoes either. Shown at once, put back if the API says no.
 */
export function useUpdateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<MeUpdate, "onboardingCompleted" | "gettingStartedDismissed">) => updateMe(body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.me });
      const previous = qc.getQueryData<Me>(qk.me);
      const now = new Date().toISOString();
      if (previous) {
        qc.setQueryData<Me>(qk.me, {
          ...previous,
          ...(body.onboardingCompleted === undefined ? {} : { onboardingCompletedAt: body.onboardingCompleted ? now : null }),
          ...(body.gettingStartedDismissed === undefined ? {} : { gettingStartedDismissedAt: body.gettingStartedDismissed ? now : null }),
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) qc.setQueryData(qk.me, context.previous);
    },
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

// ---------------------------------------------------------------- channels

// One request answers both: which chats are linked, and which channels can be offered.
const channelsQuery = { queryKey: qk.channels, queryFn: () => unwrap(api.GET("/v1/channels")) };

/** Both halves of `GET /v1/channels`: the linked chats (`items`) and the channels switched on (`available`). */
export function useChannelList(enabled = true) {
  return useQuery({ ...channelsQuery, enabled });
}

/** The chats this person has linked. */
export function useChannels() {
  return useQuery({ ...channelsQuery, select: (data) => data.items });
}

/** The channels that are switched on, in the backend's order (`web` is the web chat). Offer only these. */
export function useAvailableChannels() {
  return useQuery({ ...channelsQuery, select: (data) => data.available });
}

export function useCreateLinkCode() {
  return useMutation({
    mutationFn: (channel: ChannelType) => unwrap(api.POST("/v1/channels/link-codes", { body: { channel } })),
  });
}

export function useUnlinkChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelLinkId: string) =>
      unwrap(api.DELETE("/v1/channels/{channelLinkId}", { params: { path: { channelLinkId } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.channels }),
  });
}

// ---------------------------------------------------------------- chat

/**
 * The chat history: every conversation, the one something was last said in first. The Automations
 * chat is left out (`kind=chat`): it is pinned apart (`useAutomationsChat`). An older backend
 * ignores `kind` and has no Automations chat.
 */
export function useConversations(enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.conversations,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await unwrap(api.GET("/v1/conversations", { params: { query: { limit: PAGE, cursor: pageParam, kind: "chat" } } }));
      return { ...page, items: page.items.filter((item) => !isAutomationsChat(item)) };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * The Automations chat, where every run of every automation answers, or null while there is none
 * (no automation has been made or run yet; it can't be deleted, so that is the only case). An older
 * backend ignores `kind` and has no Automations chat: each item's own kind is checked.
 */
export function useAutomationsChat() {
  return useQuery({
    queryKey: qk.automationsChat,
    queryFn: async (): Promise<Conversation | null> => {
      const page = await unwrap(api.GET("/v1/conversations", { params: { query: { limit: 1, kind: "automations" } } }));
      return automationsChatIn(page.items);
    },
  });
}

/**
 * What is pinned under "New chat": the Automations chat (`chat`) or, while the backend hasn't
 * started it yet, a stand-in for it, so it can always be found. The backend starts it when an
 * automation is made or runs, so someone whose automations were all made before it existed has none
 * until the next run. `waiting` is the person's automations while the stand-in is pinned (at least
 * one, on a backend that has the Automations chat), else null.
 *
 * The automations are asked for only while there is no Automations chat, and only when `lookForIt`
 * (where the row is drawn, or when it was asked for). `pending`: not known yet.
 */
export function usePinnedAutomations(lookForIt: boolean) {
  const chat = useAutomationsChat();
  const list = useConversations();
  const none = chat.isSuccess && chat.data === null && list.isSuccess && serverHasAutomationsChat(allConversations(list.data));
  const automations = useAutomations({ enabled: lookForIt && none });
  const waiting = none && automations.data?.length ? automations.data : null;
  return {
    chat: chat.data ?? null,
    waiting,
    pending: chat.isPending || (chat.data === null && list.isPending) || (none && lookForIt && automations.isPending),
  };
}

const automationsChatOf = (qc: QueryClient) => qc.getQueryData<Conversation | null>(qk.automationsChat) ?? null;

/** Puts a new or changed conversation where it belongs: pinned (the Automations chat), or in the dated list. */
export function upsertConversation(qc: QueryClient, conversation: Conversation) {
  if (isAutomationsChat(conversation)) qc.setQueryData<Conversation | null>(qk.automationsChat, conversation);
  qc.setQueryData<ConversationList>(qk.conversations, (list) => (list ? placeConversation(list, conversation) : list));
}

/** A conversation was deleted: it leaves the list, and its messages leave the cache with it. */
export function removeConversation(qc: QueryClient, conversationId: string) {
  qc.setQueryData<ConversationList>(qk.conversations, (list) => (list ? dropConversation(list, conversationId) : list));
  if (automationsChatOf(qc)?.id === conversationId) qc.setQueryData<Conversation | null>(qk.automationsChat, null);
  qc.removeQueries({ queryKey: qk.thread(conversationId) });
}

type MessagePage = Page<Message>;
type Thread = InfiniteData<MessagePage, string | undefined>;

/** How far along each status is. The backend only ever moves a message forward along this. */
const STATUS_STEP: Record<Message["status"], number> = { queued: 0, processing: 1, sent: 2, delivered: 3, failed: 3, read: 4 };

/**
 * Of two copies of one message, the one further along. A copy that says less is older than what is
 * known already (the reply to sending it, or a list asked for while the turn ran and answered after
 * the turn's last event): it never takes the message back, so "Tex is on it" doesn't come back under
 * a message that was delivered.
 */
export function laterMessage(known: Message, incoming: Message): Message {
  return STATUS_STEP[incoming.status] >= STATUS_STEP[known.status] ? incoming : { ...incoming, status: known.status };
}

/** A conversation's cached messages, newest first; undefined when its thread hasn't been asked for. */
export function cachedThread(qc: QueryClient, conversationId: string): Message[] | undefined {
  return qc.getQueryData<Thread>(qk.thread(conversationId))?.pages.flatMap((page) => page.items);
}

/** A page of a thread from the API, each message in it kept as far along as the cache already has it. */
export function pageAfterCache(qc: QueryClient, conversationId: string, page: MessagePage): MessagePage {
  const known = new Map((cachedThread(qc, conversationId) ?? []).map((message) => [message.id, message]));
  if (!known.size) return page;
  return { ...page, items: page.items.map((message) => (known.has(message.id) ? laterMessage(known.get(message.id)!, message) : message)) };
}

/** One conversation's messages, newest first. Nothing is asked for until a conversation is known. */
export function useThread(conversationId: string | null) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    queryKey: qk.thread(conversationId ?? ""),
    enabled: conversationId !== null,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<MessagePage> => {
      const page = await unwrap(api.GET("/v1/messages", { params: { query: { limit: PAGE, cursor: pageParam, conversationId: conversationId ?? undefined } } }));
      return conversationId ? pageAfterCache(qc, conversationId, page) : page;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Whether a conversation's thread is known to be empty. Undefined when it hasn't been asked for. */
function threadIsEmpty(qc: QueryClient, conversationId: string): boolean | undefined {
  const thread = qc.getQueryData<Thread>(qk.thread(conversationId));
  return thread ? thread.pages.every((page) => page.items.length === 0) : undefined;
}

/** The id of a message the person just sent, shown at once while the API saves it (`localMessage`). */
export const LOCAL_ID_PREFIX = "local:";

/** Whether a message is only on this screen so far: sent, and not yet saved by the API. */
export const isLocalMessage = (message: Pick<Message, "id">) => message.id.startsWith(LOCAL_ID_PREFIX);

/**
 * The person's message as the thread shows it the moment they send it ("sending"), before the API
 * has saved it. The saved message takes its place (`withMessage`); it goes if the send fails.
 */
export function localMessage(
  input: { clientMessageId: string; conversationId: string; text: string; attachments?: readonly Pick<Attachment, "id" | "name" | "mimeType">[] },
  now = new Date(),
): Message {
  return {
    id: `${LOCAL_ID_PREFIX}${input.clientMessageId}`,
    conversationId: input.conversationId,
    channel: "web",
    direction: "in",
    text: input.text,
    ...(input.attachments?.length ? { attachments: input.attachments.map(({ id, name, mimeType }) => ({ id, name, mimeType })) } : {}),
    status: "queued",
    approvalId: null,
    clientMessageId: input.clientMessageId,
    createdAt: now.toISOString(),
  };
}

/**
 * The "sending" bubble a saved message stands for: the one sent with the same `clientMessageId`. A
 * backend that doesn't say it yet: the newest one with the same words, for a message of the person's
 * from web chat.
 */
function standIn(items: readonly Message[], message: Message): Message | undefined {
  if (isLocalMessage(message) || message.direction !== "in" || message.channel !== "web") return undefined;
  const locals = items.filter(isLocalMessage);
  if (message.clientMessageId) return locals.find((local) => local.clientMessageId === message.clientMessageId);
  return locals.find((local) => local.text === message.text);
}

/**
 * A thread (newest first) with a new or changed message in it. A saved message of the person's takes
 * the place of the "sending" bubble it stands for, so the two are never both shown, whichever comes
 * first: the API's answer to the send, or the message on the live stream.
 */
export function withMessage(data: Thread, message: Message): Thread {
  const items = data.pages.flatMap((page) => page.items);
  const local = standIn(items, message);
  if (items.some((item) => item.id === message.id)) {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item !== local).map((item) => (item.id === message.id ? laterMessage(item, message) : item)),
      })),
    };
  }
  if (local) {
    return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item === local ? message : item)) })) };
  }
  const [first, ...rest] = data.pages;
  if (!first) return data;
  return { ...data, pages: [{ ...first, items: [message, ...first.items] }, ...rest] };
}

/** Puts a new or changed message into its conversation's cached thread (the API lists newest first). */
export function upsertMessage(qc: QueryClient, message: Message) {
  qc.setQueryData<Thread>(qk.thread(message.conversationId), (data) => (data ? withMessage(data, message) : data));
}

/** Takes the "sending" bubble of a send that failed (or was answered) out of its thread. */
export function removeLocalMessage(qc: QueryClient, conversationId: string, clientMessageId: string) {
  const id = `${LOCAL_ID_PREFIX}${clientMessageId}`;
  qc.setQueryData<Thread>(qk.thread(conversationId), (data) => {
    if (!data?.pages.some((page) => page.items.some((item) => item.id === id))) return data;
    return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== id) })) };
  });
}

/**
 * A new message was saved: besides its thread, its conversation moves to the top of the list. A
 * conversation the list doesn't have yet (the first web message, a new chat on Telegram) is asked for.
 */
export function addMessage(qc: QueryClient, message: Message) {
  upsertMessage(qc, message);
  // In the Automations chat: it stays pinned, with its newest message later now.
  const automations = automationsChatOf(qc);
  if (automations?.id === message.conversationId) {
    qc.setQueryData<Conversation | null>(qk.automationsChat, automationsChatSpoke(automations, message));
    return;
  }
  const list = qc.getQueryData<ConversationList>(qk.conversations);
  if (!list) return;
  const next = conversationSpoke(list, message);
  if (next === null) void qc.invalidateQueries({ queryKey: qk.conversations });
  else if (next !== list) qc.setQueryData<ConversationList>(qk.conversations, next);
}

/**
 * "New chat": starts a new web conversation, in which Tex starts afresh (its saved memories stay),
 * and makes it the active one. When nothing has been said in the active one yet, that one is
 * handed back instead of starting another empty one.
 */
export function useNewChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Conversation> => {
      const conversations = allConversations(qc.getQueryData<ConversationList>(qk.conversations));
      return emptyActiveChat(conversations, (id) => threadIsEmpty(qc, id)) ?? unwrap(api.POST("/v1/conversations"));
    },
    onSuccess: (conversation) => {
      upsertConversation(qc, conversation);
      // Nothing has been said in it, so its thread is known without asking.
      qc.setQueryData<Thread>(qk.thread(conversation.id), (data) => data ?? { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });
      // It is in the activity log (`chat_started`).
      void qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

/** Renames a conversation. Shown at once; put back if the API says no. */
export function useRenameConversation() {
  const qc = useQueryClient();
  const retitle = (conversationId: string, title: string) =>
    qc.setQueryData<ConversationList>(qk.conversations, (list) => {
      const current = allConversations(list).find((item) => item.id === conversationId);
      return list && current ? placeConversation(list, { ...current, title }) : list;
    });
  return useMutation({
    mutationFn: (input: { conversationId: string; title: string }) =>
      unwrap(api.PATCH("/v1/conversations/{conversationId}", { params: { path: { conversationId: input.conversationId } }, body: { title: input.title } })),
    onMutate: (input) => {
      const previous = allConversations(qc.getQueryData<ConversationList>(qk.conversations)).find((item) => item.id === input.conversationId)?.title;
      retitle(input.conversationId, input.title);
      return { previous };
    },
    onError: (_error, input, context) => {
      if (context?.previous !== undefined) retitle(input.conversationId, context.previous);
    },
    onSuccess: (conversation) => upsertConversation(qc, conversation),
  });
}

/** Deletes a conversation with its messages and files. It can't be undone. */
export function useDeleteConversation() {
  const qc = useQueryClient();
  const gone = (conversationId: string) => {
    removeConversation(qc, conversationId);
    // The backend may have made another web conversation the active one, or started an empty one.
    void qc.invalidateQueries({ queryKey: qk.conversations });
    // It is in the activity log (`conversation_deleted`).
    void qc.invalidateQueries({ queryKey: qk.activity });
  };
  return useMutation({
    mutationFn: (conversationId: string) => unwrap(api.DELETE("/v1/conversations/{conversationId}", { params: { path: { conversationId } } })),
    onSuccess: (_data, conversationId) => gone(conversationId),
    // A 404 means it was already gone, and the list should say so.
    onError: (error, conversationId) => {
      if (error instanceof ApiError && error.status === 404) gone(conversationId);
    },
  });
}

/** Changes one conversation wherever it is kept: in the dated list, or pinned (the Automations chat). */
function changeCachedConversation(qc: QueryClient, conversationId: string, change: (conversation: Conversation) => Conversation) {
  qc.setQueryData<ConversationList>(qk.conversations, (list) => (list ? changeConversation(list, conversationId, change) : list));
  const automations = automationsChatOf(qc);
  if (automations?.id !== conversationId) return;
  const next = change(automations);
  if (next !== automations) qc.setQueryData<Conversation | null>(qk.automationsChat, next);
}

/**
 * Marks a conversation read: the person is looking at it. Its mark goes at once; the backend's
 * answer then says what it is now, unless something newer arrived in the meantime (that message's
 * own event says). If the request fails, the list is asked for again, to show what the backend has.
 */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      unwrap(api.POST("/v1/conversations/{conversationId}/read", { params: { path: { conversationId } } })),
    onMutate: (conversationId) => changeCachedConversation(qc, conversationId, (conversation) => readMarked(conversation)),
    onSuccess: (answer, conversationId) => changeCachedConversation(qc, conversationId, (conversation) => readMarked(conversation, answer)),
    onError: () => void qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}

/** What the composer sends: the words, the files already uploaded, and the id that makes sending it twice harmless. */
export type SendInput = {
  text: string;
  /** Made before the request, so the "sending" bubble and the saved message can be matched. */
  clientMessageId: string;
  attachments?: readonly Attachment[];
  conversationId?: string;
};

const postMessage = (input: SendInput): Promise<Message> =>
  unwrap(
    api.POST("/v1/messages", {
      body: {
        text: input.text,
        clientMessageId: input.clientMessageId,
        ...(input.attachments?.length ? { attachmentIds: input.attachments.map((file) => file.id) } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      },
    }),
  );

/**
 * Sending a web message, as `useSendMessage` does it (apart, so it can be tried without React):
 * - at once, the message shows in the open conversation as "sending" (`localMessage`);
 * - the saved message takes its place (`withMessage`), from the API's answer or the live stream;
 * - if the send fails, the "sending" bubble goes (the composer puts the words back and says why).
 * With no conversation open yet (nothing said in web chat), there is no thread to show it in: it
 * shows with the API's answer, which starts the conversation.
 */
export function sendMessageOptions(qc: QueryClient, post: (input: SendInput) => Promise<Message> = postMessage): MutationOptions<Message, Error, SendInput> {
  return {
    mutationFn: post,
    onMutate: (input) => {
      if (input.conversationId) upsertMessage(qc, localMessage({ ...input, conversationId: input.conversationId }));
    },
    onError: (_error, input) => {
      if (input.conversationId) removeLocalMessage(qc, input.conversationId, input.clientMessageId);
    },
    onSuccess: (message, input) => {
      const list = qc.getQueryData<ConversationList>(qk.conversations);
      const inAutomations = automationsChatOf(qc)?.id === message.conversationId;
      if (list && !inAutomations && !allConversations(list).some((item) => item.id === message.conversationId)) {
        // The first thing said in web chat started its conversation. It is shown at once, with
        // this message; the backend's own copy of both is asked for and replaces them.
        upsertConversation(qc, conversationStartedBy(message));
        qc.setQueryData<Thread>(qk.thread(message.conversationId), (data) => data ?? { pages: [{ items: [message], nextCursor: null }], pageParams: [undefined] });
        void qc.invalidateQueries({ queryKey: qk.conversations });
        void qc.invalidateQueries({ queryKey: qk.thread(message.conversationId) });
      }
      addMessage(qc, message);
      // Whatever happened to it on the way, the "sending" bubble has done its job.
      if (input.conversationId) removeLocalMessage(qc, input.conversationId, input.clientMessageId);
    },
  };
}

/**
 * Sends a web message. With `conversationId` it is written in that web conversation, which becomes
 * the active one, and Tex carries on with that conversation's own context; without, in the active one.
 * The Automations chat is written in where it is: it never becomes the active one. The message
 * shows at once, before the API answers (`sendMessageOptions`); several can be on their way at once.
 */
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation(sendMessageOptions(qc));
}

export function useUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File): Promise<Attachment> => {
      const form = new FormData();
      form.append("file", file);
      let response: Response;
      try {
        response = await fetch("/api/v1/attachments", { method: "POST", body: form });
      } catch {
        throw new ApiError(0, "network", "You seem to be offline. Check your connection and try again.");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(
          response.status,
          body?.error?.code ?? "internal",
          response.status === 413 ? `${file.name} is too large to send.` : (body?.error?.message ?? "Couldn't upload that file."),
        );
      }
      return body as Attachment;
    },
  });
}

// ---------------------------------------------------------------- approvals

export function useApprovals(status: ApprovalStatus = "pending") {
  return useQuery({
    queryKey: qk.approvals(status),
    queryFn: () => unwrap(api.GET("/v1/approvals", { params: { query: { status, limit: 50 } } })),
    select: (data) => data.items,
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { approvalId: string; decision: "approve" | "reject" }) =>
      unwrap(
        api.POST("/v1/approvals/{approvalId}/decision", {
          params: { path: { approvalId: input.approvalId } },
          body: { decision: input.decision },
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
}

/** Looks an approval up in whatever lists are cached (used by the chat's approval card). */
export function findCachedApproval(qc: QueryClient, approvalId: string): Approval | undefined {
  for (const [, data] of qc.getQueriesData<Page<Approval>>({ queryKey: ["approvals"] })) {
    const hit = data?.items.find((a) => a.id === approvalId);
    if (hit) return hit;
  }
  return undefined;
}

// ---------------------------------------------------------------- apps

export function useApps(enabled = true) {
  return useQuery({ queryKey: qk.apps, queryFn: () => unwrap(api.GET("/v1/apps")), select: (data) => data.items, enabled });
}

export function useConnectApp() {
  return useMutation({
    mutationFn: (input: { appSlug: string; returnUrl?: string }) =>
      unwrap(
        api.POST("/v1/apps/{appSlug}/connect", {
          params: { path: { appSlug: input.appSlug } },
          body: input.returnUrl ? { returnUrl: input.returnUrl } : {},
        }),
      ),
  });
}

export function useDisconnectApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      unwrap(api.DELETE("/v1/connections/{connectionId}", { params: { path: { connectionId } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apps }),
  });
}

// ---------------------------------------------------------------- own MCP servers

export function useMcpServers(enabled = true) {
  return useQuery({
    queryKey: qk.mcpServers,
    queryFn: () => unwrap(api.GET("/v1/mcp-servers")),
    select: (data) => data.items,
    enabled,
  });
}

export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: McpServerCreate) => unwrap(api.POST("/v1/mcp-servers", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mcpServers }),
  });
}

export function useUpdateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mcpServerId: string; name?: string; enabled?: boolean }) =>
      unwrap(
        api.PATCH("/v1/mcp-servers/{mcpServerId}", {
          params: { path: { mcpServerId: input.mcpServerId } },
          body: { name: input.name, enabled: input.enabled },
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.mcpServers }),
  });
}

export function useDeleteMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mcpServerId: string) =>
      unwrap(api.DELETE("/v1/mcp-servers/{mcpServerId}", { params: { path: { mcpServerId } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mcpServers }),
  });
}

// ---------------------------------------------------------------- bring your own key

export function useByokKeys() {
  return useQuery({ queryKey: qk.byok, queryFn: () => unwrap(api.GET("/v1/byok")), select: (data) => data.items });
}

function invalidateAi(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.byok }),
    qc.invalidateQueries({ queryKey: qk.agentSettings }),
  ]);
}

export function useSetByokKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: ByokProvider; apiKey: string; model?: string }) =>
      unwrap(
        api.PUT("/v1/byok/{provider}", {
          params: { path: { provider: input.provider } },
          body: { apiKey: input.apiKey, ...(input.model ? { model: input.model } : {}) },
        }),
      ),
    onSuccess: () => invalidateAi(qc),
  });
}

export function useDeleteByokKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ByokProvider) =>
      unwrap(api.DELETE("/v1/byok/{provider}", { params: { path: { provider } } })),
    onSuccess: () => invalidateAi(qc),
  });
}

// ---------------------------------------------------------------- automations

/** A repo with pull-request review on is an automation too, so the two lists change together. */
export function invalidateAutomations(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.automations }),
    qc.invalidateQueries({ queryKey: qk.prReviews }),
  ]);
}

export function useAutomations({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.automations,
    queryFn: () => unwrap(api.GET("/v1/automations")),
    select: (data) => data.items,
    enabled,
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { automationId: string; enabled: boolean }) =>
      unwrap(
        api.PATCH("/v1/automations/{automationId}", {
          params: { path: { automationId: input.automationId } },
          body: { enabled: input.enabled },
        }),
      ),
    // Flip the switch straight away; roll back if the API says no.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.automations });
      const previous = qc.getQueryData<{ items: Automation[] }>(qk.automations);
      qc.setQueryData<{ items: Automation[] }>(qk.automations, (data) =>
        data
          ? { items: data.items.map((a) => (a.id === input.automationId ? { ...a, enabled: input.enabled } : a)) }
          : data,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(qk.automations, context.previous);
    },
    onSettled: () => invalidateAutomations(qc),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (automationId: string) =>
      unwrap(api.DELETE("/v1/automations/{automationId}", { params: { path: { automationId } } })),
    onSuccess: () => invalidateAutomations(qc),
  });
}

// ---------------------------------------------------------------- pull-request review

/** The GitHub repos with pull-request review on. Each one is also an automation (`preset: pr_review`). */
export function usePrReviews() {
  return useQuery({
    queryKey: qk.prReviews,
    queryFn: () => unwrap(api.GET("/v1/pr-reviews")),
    select: (data) => data.items,
  });
}

/** Turns review on for one repo. Asking again for a repo that is already on resumes it if it was paused. */
export function useEnablePrReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repo: { owner: string; repo: string }) =>
      unwrap(api.PUT("/v1/pr-reviews/{owner}/{repo}", { params: { path: repo } })),
    onSuccess: () => invalidateAutomations(qc),
  });
}

/** Turns review off for one repo: the automation goes, and with it the OK to comment there. */
export function useDisablePrReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repo: { owner: string; repo: string }) =>
      unwrap(api.DELETE("/v1/pr-reviews/{owner}/{repo}", { params: { path: repo } })),
    // Also after a failure: a 404 means it was already off, and the list should say so.
    onSettled: () => invalidateAutomations(qc),
  });
}

// ---------------------------------------------------------------- agent

// How many times the live stream has said what the agent is doing (`agent.status`), per query cache.
const statusEvents = new WeakMap<QueryClient, number>();

/** The live stream said what the agent is doing (`src/lib/api/stream.ts`). */
export function noteAgentStatusEvent(qc: QueryClient): void {
  statusEvents.set(qc, (statusEvents.get(qc) ?? 0) + 1);
}

/**
 * Asks the API what the agent is doing. When the live stream said so while the answer was on its
 * way, the stream's word is the newer one and stays: an answer read while a turn ran ("busy") and
 * arriving after the turn's end ("awake") would otherwise put Tex back to work.
 */
export async function fetchAgentStatus(qc: QueryClient, ask: () => Promise<AgentStatus> = () => unwrap(api.GET("/v1/agent/status"))): Promise<AgentStatus> {
  const before = statusEvents.get(qc) ?? 0;
  const answer = await ask();
  const heard = qc.getQueryData<AgentStatus>(qk.agentStatus);
  return (statusEvents.get(qc) ?? 0) !== before && heard ? heard : answer;
}

/** `enabled: false` reads what is cached without asking (the sidebar's card, hidden on a phone). */
export function useAgentStatus(enabled = true) {
  const qc = useQueryClient();
  return useQuery({ queryKey: qk.agentStatus, queryFn: () => fetchAgentStatus(qc), enabled });
}

/**
 * What the agent is doing in the turn that is running: the latest line of each crew member.
 * Nothing is fetched: the event stream writes it (`agent.progress`) and empties it when the turn ends.
 */
export function useAgentProgress() {
  return useQuery<ProgressLine[]>({
    queryKey: qk.agentProgress,
    queryFn: () => [],
    enabled: false,
    initialData: [],
    staleTime: Infinity,
  });
}

export function useAgentSettings(enabled = true) {
  return useQuery({ queryKey: qk.agentSettings, queryFn: () => unwrap(api.GET("/v1/agent/settings")), enabled });
}

function useSettingsMutation<TInput>(run: (input: TInput) => Promise<AgentSettings>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: (settings) => qc.setQueryData(qk.agentSettings, settings) });
}

/** Changes the agent, the AI preference (`platform` is Textcrew AI over your own AI), or both. */
export function useUpdateAgentSettings() {
  return useSettingsMutation((body: { runtime?: AgentRuntime; aiPreference?: AiPreference }) =>
    unwrap(api.PATCH("/v1/agent/settings", { body })),
  );
}

/**
 * Claude Code's model and thinking effort (null is Claude Code's default). Shown as chosen at once;
 * put back if the API says no.
 */
export function useUpdateClaudeCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<AgentSettingsUpdate, "claudeModel" | "claudeEffort">) =>
      unwrap(api.PATCH("/v1/agent/settings", { body })),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.agentSettings });
      const previous = qc.getQueryData<AgentSettings>(qk.agentSettings);
      if (previous) qc.setQueryData<AgentSettings>(qk.agentSettings, { ...previous, ...body });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) qc.setQueryData(qk.agentSettings, context.previous);
    },
    onSuccess: (settings) => qc.setQueryData(qk.agentSettings, settings),
  });
}

/** The lead and the specialists, with who works on this deployment yet. It only changes with a deploy. */
export function useCrew(enabled = true) {
  return useQuery({
    queryKey: qk.crew,
    queryFn: () => unwrap(api.GET("/v1/crew")),
    select: (data) => data.items,
    staleTime: 5 * 60_000,
    enabled,
  });
}

// ---------------------------------------------------------------- memory

/**
 * What Tex has saved about this person, newest first, and the most it can hold. All of it comes in
 * one answer. There is no live event for it: the event stream asks again when a turn ends.
 */
export function useMemories() {
  return useQuery({ queryKey: qk.memories, queryFn: () => unwrap(api.GET("/v1/memories")) });
}

/** A delete is in the activity log too (`memory_deleted`, `memories_cleared`). */
function invalidateMemory(qc: QueryClient) {
  return Promise.all([qc.invalidateQueries({ queryKey: qk.memories }), qc.invalidateQueries({ queryKey: qk.activity })]);
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memoryId: string) => unwrap(api.DELETE("/v1/memories/{memoryId}", { params: { path: { memoryId } } })),
    // Also after a failure: a 404 means it was already gone, and the list should say so.
    onSettled: () => invalidateMemory(qc),
  });
}

/** Deletes every memory. It can't be undone. */
export function useDeleteAllMemories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/v1/memories")),
    onSettled: () => invalidateMemory(qc),
  });
}

export function useStartClaudeLogin() {
  return useMutation({ mutationFn: () => unwrap(api.POST("/v1/agent/claude/login")) });
}

export function useCompleteClaudeLogin() {
  return useSettingsMutation((input: { loginId: string; code: string }) =>
    unwrap(
      api.POST("/v1/agent/claude/login/{loginId}/complete", {
        params: { path: { loginId: input.loginId } },
        body: { code: input.code },
      }),
    ),
  );
}

export function useDisconnectClaude() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/v1/agent/claude")),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.agentSettings }),
  });
}

// ---------------------------------------------------------------- billing

export function usePlans(enabled = true) {
  return useQuery({ queryKey: qk.plans, queryFn: () => unwrap(api.GET("/v1/billing/plans")), staleTime: 5 * 60_000, enabled });
}

export function useSubscription(enabled = true) {
  return useQuery({ queryKey: qk.subscription, queryFn: () => unwrap(api.GET("/v1/billing/subscription")), enabled });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (input: { kind: "plan"; planId: PlanId } | { kind: "topup"; topUpId: string }) =>
      unwrap(api.POST("/v1/billing/checkout", { body: input })),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/v1/billing/subscription/cancel")),
    onSuccess: (subscription) => qc.setQueryData(qk.subscription, subscription),
  });
}

// ---------------------------------------------------------------- credits

export function useCredits(enabled = true) {
  return useQuery({ queryKey: qk.credits, queryFn: () => unwrap(api.GET("/v1/credits")), enabled });
}

export function useLedger() {
  return useInfiniteQuery({
    queryKey: qk.ledger,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET("/v1/credits/ledger", { params: { query: { limit: PAGE, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useUsage(from: string, to: string) {
  return useQuery({
    queryKey: qk.usage(from, to),
    queryFn: () => unwrap(api.GET("/v1/usage", { params: { query: { from, to } } })),
  });
}

export function useRedeemCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => unwrap(api.POST("/v1/coupons/redeem", { body: { code } })),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.credits }),
        qc.invalidateQueries({ queryKey: qk.me }),
      ]),
  });
}

// ---------------------------------------------------------------- activity

export function useActivity() {
  return useInfiniteQuery({
    queryKey: qk.activity,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET("/v1/activity", { params: { query: { limit: PAGE, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
