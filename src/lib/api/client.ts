import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

/** Typed client for the Next.js proxy at /api/v1/*, which forwards to the backend's /v1/*. */
export const api = createClient<paths>({ baseUrl: "/api" });

type Schemas = components["schemas"];

export type Me = Schemas["Me"];
export type PlanId = Schemas["PlanId"];
export type ChannelType = Schemas["ChannelType"];
export type ChannelLink = Schemas["ChannelLink"];
export type LinkCode = Schemas["LinkCode"];
export type Message = Schemas["Message"];
/** `chat`, or `automations` for the Automations chat, where every run of every automation answers. */
export type ConversationKind = Schemas["ConversationKind"];
/**
 * One stretch of a chat between two "New chat" actions; Tex's context is separate for each. An
 * older backend sends no `kind`: that reads as `chat`.
 */
export type Conversation = Omit<Schemas["Conversation"], "kind"> & { kind?: ConversationKind };
export type Approval = Schemas["Approval"];
export type ApprovalStatus = Schemas["ApprovalStatus"];
export type App = Schemas["App"];
export type McpServer = Schemas["McpServer"];
export type McpServerCreate = Schemas["McpServerCreate"];
export type ByokProvider = Schemas["ByokProvider"];
export type ByokKey = Schemas["ByokKey"];
export type Automation = Schemas["Automation"];
export type PrReviewRepo = Schemas["PrReviewRepo"];
export type AgentStatus = Schemas["AgentStatus"];
export type AgentProgress = Schemas["AgentProgress"];
export type MessageDraft = Schemas["MessageDraft"];
export type AgentSettings = Schemas["AgentSettings"];
export type AgentRuntime = Schemas["AgentRuntime"];
export type AiPreference = Schemas["AiPreference"];
/** How hard Claude Code thinks, when it runs (null in the settings is Claude Code's default). */
export type ClaudeEffort = NonNullable<AgentSettings["claudeEffort"]>;
/** What `PATCH /v1/agent/settings` takes. */
export type AgentSettingsUpdate = NonNullable<paths["/v1/agent/settings"]["patch"]["requestBody"]>["content"]["application/json"];
export type CrewMember = Schemas["CrewMember"];
/** A brief the person gave Patch or Byte, run as one turn of the agent, with its report when done. */
export type CrewJob = Schemas["CrewJob"];
export type CrewJobInput = Schemas["CrewJobInput"];
export type CrewJobFocus = Schemas["CrewJobFocus"];
export type GithubRepo = Schemas["GithubRepo"];
export type Memory = Schemas["Memory"];
export type ClaudeLoginStart = Schemas["ClaudeLoginStart"];
export type Plan = Schemas["Plan"];
export type TopUpPack = Schemas["TopUpPack"];
export type Subscription = Schemas["Subscription"];
export type CreditBalance = Schemas["CreditBalance"];
export type CreditGrant = Schemas["CreditGrant"];
export type LedgerEntry = Schemas["LedgerEntry"];
export type UsagePeriod = Schemas["UsagePeriod"];
export type UsageTotals = Schemas["UsageTotals"];
export type CouponRedemption = Schemas["CouponRedemption"];
export type ActivityEntry = Schemas["ActivityEntry"];
export type StreamEvent = Schemas["StreamEvent"];
export type Attachment = { id: string; name: string; sizeBytes: number; mimeType: string };

/** An error answer from the API, in the contract's `Error` shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get outOfCredits(): boolean {
    return this.status === 402 || this.code === "out_of_credits";
  }

  get planLimit(): boolean {
    return this.code === "plan_limit";
  }
}

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

function toApiError(error: unknown, response: Response): ApiError {
  const body = (error as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | undefined)?.error;
  return new ApiError(
    response.status,
    body?.code ?? "internal",
    body?.message ?? "Something went wrong. Try again.",
    body?.details,
  );
}

/** Returns the response body, or throws an ApiError. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch {
    throw new ApiError(0, "network", "You seem to be offline. Check your connection and try again.");
  }
  if (!result.response.ok) throw toApiError(result.error, result.response);
  return result.data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
