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
  type McpServerCreate,
  type Message,
  type PlanId,
} from "./client";
import type { ProgressLine } from "../crew";

// One place for every query key, so the event stream and mutations invalidate the same things.
export const qk = {
  me: ["me"] as const,
  channels: ["channels"] as const,
  messages: (channel: ChannelType | "all" = "all") => ["messages", channel] as const,
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

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; timezone?: string }) => unwrap(api.PATCH("/v1/me", { body })),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

// ---------------------------------------------------------------- channels

// One request answers both: which chats are linked, and which channels can be offered.
const channelsQuery = { queryKey: qk.channels, queryFn: () => unwrap(api.GET("/v1/channels")) };

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

export function useMessages(channel: ChannelType | "all" = "all") {
  return useInfiniteQuery({
    queryKey: qk.messages(channel),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/messages", {
          params: { query: { limit: PAGE, cursor: pageParam, channel: channel === "all" ? undefined : channel } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Puts a new or changed message into every cached thread it belongs to (the API lists newest first). */
export function upsertMessage(qc: QueryClient, message: Message) {
  const belongs = (key: readonly unknown[]) => key[1] === "all" || key[1] === message.channel;
  qc.setQueriesData<InfiniteData<Page<Message>>>(
    { queryKey: ["messages"], predicate: (query) => belongs(query.queryKey) },
    (data) => {
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
    },
  );
}

/** A page of the chat: the messages, and when the web chat's latest new chat started (null if never). */
type MessagePage = Page<Message> & { chatStartedAt?: string | null };

/** When the web chat's latest new chat started, from a cached thread (its newest page says it). */
export function chatStartedAtOf(data: InfiniteData<MessagePage> | undefined): string | null {
  return data?.pages[0]?.chatStartedAt ?? null;
}

/**
 * Starts a new web chat: Tex no longer sees what was said before in it. The earlier messages stay
 * listed; every cached thread learns the new start, so the "New chat" divider shows at once.
 */
export function useStartNewChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/v1/chats/new")),
    onSuccess: ({ chatStartedAt }) => {
      qc.setQueriesData<InfiniteData<MessagePage>>({ queryKey: ["messages"] }, (data) =>
        data ? { ...data, pages: data.pages.map((page) => ({ ...page, chatStartedAt })) } : data,
      );
      // It is in the activity log (`chat_started`).
      void qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; attachmentIds?: string[]; clientMessageId?: string }) =>
      unwrap(
        api.POST("/v1/messages", {
          body: {
            text: input.text,
            clientMessageId: input.clientMessageId ?? crypto.randomUUID(),
            ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
          },
        }),
      ),
    onSuccess: (message) => upsertMessage(qc, message),
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

export function useApps() {
  return useQuery({ queryKey: qk.apps, queryFn: () => unwrap(api.GET("/v1/apps")), select: (data) => data.items });
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

export function useAutomations() {
  return useQuery({
    queryKey: qk.automations,
    queryFn: () => unwrap(api.GET("/v1/automations")),
    select: (data) => data.items,
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

export function useAgentSettings() {
  return useQuery({ queryKey: qk.agentSettings, queryFn: () => unwrap(api.GET("/v1/agent/settings")) });
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
