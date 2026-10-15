"use client";

import {
  type InfiniteData,
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
  type AgentSettingsUpdate,
  type AiPreference,
  type Approval,
  type ApprovalStatus,
  type Attachment,
  type Automation,
  type ByokProvider,
  type ChannelType,
  type Conversation,
  type CrewJob,
  type CrewJobInput,
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
  conversationSpoke,
  conversationStartedBy,
  dropConversation,
  emptyActiveChat,
  isAutomationsChat,
  placeConversation,
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
  crewJobs: ["crew-jobs"] as const,
  githubRepos: ["github", "repos"] as const,
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

/** One conversation's messages, newest first. Nothing is asked for until a conversation is known. */
export function useThread(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: qk.thread(conversationId ?? ""),
    enabled: conversationId !== null,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<MessagePage> =>
      unwrap(api.GET("/v1/messages", { params: { query: { limit: PAGE, cursor: pageParam, conversationId: conversationId ?? undefined } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Whether a conversation's thread is known to be empty. Undefined when it hasn't been asked for. */
function threadIsEmpty(qc: QueryClient, conversationId: string): boolean | undefined {
  const thread = qc.getQueryData<Thread>(qk.thread(conversationId));
  return thread ? thread.pages.every((page) => page.items.length === 0) : undefined;
}

/** Puts a new or changed message into its conversation's cached thread (the API lists newest first). */
export function upsertMessage(qc: QueryClient, message: Message) {
  qc.setQueryData<Thread>(qk.thread(message.conversationId), (data) => {
    if (!data) return data;
    const exists = data.pages.some((p) => p.items.some((m) => m.id === message.id));
    if (exists) {
      return {
        ...data,
        pages: data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === message.id ? message : m)) })),
      };
    }
    const [first, ...rest] = data.pages;
    if (!first) return data;
    return { ...data, pages: [{ ...first, items: [message, ...first.items] }, ...rest] };
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

/**
 * Sends a web message. With `conversationId` it is written in that web conversation, which becomes
 * the active one, and Tex carries on with that conversation's own context; without, in the active one.
 * The Automations chat is written in where it is: it never becomes the active one.
 */
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; attachmentIds?: string[]; clientMessageId?: string; conversationId?: string }) =>
      unwrap(
        api.POST("/v1/messages", {
          body: {
            text: input.text,
            clientMessageId: input.clientMessageId ?? crypto.randomUUID(),
            ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          },
        }),
      ),
    onSuccess: (message) => {
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
    },
  });
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

/** `enabled: false` reads what is cached without asking (the sidebar's card, hidden on a phone). */
export function useAgentStatus(enabled = true) {
  return useQuery({ queryKey: qk.agentStatus, queryFn: () => unwrap(api.GET("/v1/agent/status")), enabled });
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

// ---------------------------------------------------------------- crew jobs

/** How often the job list is asked for again while a job waits or works (there is no live event for it). */
export const CREW_JOBS_POLL_MS = 4000;

/**
 * The person's crew jobs, newest first (the first 30). Asked for again every few seconds while one
 * is waiting or working, so its state and its report show up without a reload. A server from before
 * crew jobs answers 404: the screen then hides them (`notOnServer` in lib/crew-jobs.ts).
 */
export function useCrewJobs() {
  return useQuery({
    queryKey: qk.crewJobs,
    queryFn: () => unwrap(api.GET("/v1/crew-jobs", { params: { query: { limit: PAGE } } })),
    select: (data) => data.items,
    refetchInterval: (query) =>
      query.state.data?.items.some((job) => job.status === "queued" || job.status === "running") ? CREW_JOBS_POLL_MS : false,
  });
}

/** Gives Patch a review or Byte a job. The same `clientRequestId` again returns the same job. */
export function useCreateCrewJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CrewJobInput) => unwrap(api.POST("/v1/crew-jobs", { body })),
    onSuccess: (job: CrewJob) => {
      qc.setQueryData<{ items: CrewJob[]; nextCursor: string | null }>(qk.crewJobs, (data) =>
        data ? { ...data, items: [job, ...data.items.filter((item) => item.id !== job.id)] } : data,
      );
      void qc.invalidateQueries({ queryKey: qk.crewJobs });
      void qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

/**
 * The repos of the connected GitHub account, to pick one from. Kept a minute, like the server
 * does. 409 (GitHub isn't connected), 503 or a 404 from an older server: the repo is typed instead.
 */
export function useGithubRepos(enabled = true) {
  return useQuery({
    queryKey: qk.githubRepos,
    queryFn: () => unwrap(api.GET("/v1/github/repos")),
    select: (data) => data.items,
    staleTime: 60_000,
    retry: false,
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
