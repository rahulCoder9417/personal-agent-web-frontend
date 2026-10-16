// Which handler answers which request. Paths are relative to /v1, with `:name` for a path parameter.

import type { Handler } from "./context";
import * as account from "./handlers-account";
import * as chat from "./handlers-chat";
import * as conversations from "./handlers-conversations";
import * as crew from "./handlers-crew";
import * as drafts from "./handlers-drafts";
import * as editor from "./handlers-editor";
import * as steps from "./handlers-steps";
import * as memory from "./handlers-memory";
import * as setup from "./handlers-setup";

type Route = { method: string; parts: string[]; handler: Handler };

const route = (method: string, path: string, handler: Handler): Route => ({ method, parts: path.split("/"), handler });

const ROUTES: Route[] = [
  route("GET", "me", account.getMe),
  route("PATCH", "me", account.updateMe),

  route("GET", "channels", account.listChannels),
  route("POST", "channels/link-codes", account.createLinkCode),
  route("DELETE", "channels/:channelLinkId", account.unlinkChannel),

  route("GET", "messages", chat.listMessages),
  route("POST", "messages", chat.sendMessage),
  route("GET", "conversations", conversations.listConversations),
  route("POST", "conversations", conversations.createConversation),
  route("PATCH", "conversations/:conversationId", conversations.updateConversation),
  route("DELETE", "conversations/:conversationId", conversations.deleteConversation),
  route("POST", "conversations/:conversationId/read", conversations.markConversationRead),
  route("POST", "chats/new", conversations.startNewChat),
  route("POST", "attachments", chat.uploadAttachment),
  route("GET", "stream", chat.openStream),

  route("GET", "approvals", chat.listApprovals),
  route("POST", "approvals/:approvalId/decision", chat.decideApproval),

  route("GET", "apps", setup.listApps),
  route("POST", "apps/:appSlug/connect", setup.connectApp),
  route("GET", "apps/:appSlug/events", editor.listAppEvents),
  route("GET", "apps/:appSlug/actions", steps.listAppActions),
  route("DELETE", "connections/:connectionId", setup.disconnectApp),

  route("GET", "mcp-servers", setup.listMcpServers),
  route("POST", "mcp-servers", setup.createMcpServer),
  route("PATCH", "mcp-servers/:mcpServerId", setup.updateMcpServer),
  route("DELETE", "mcp-servers/:mcpServerId", setup.deleteMcpServer),

  route("GET", "byok", setup.listByokKeys),
  route("PUT", "byok/:provider", setup.setByokKey),
  route("DELETE", "byok/:provider", setup.deleteByokKey),

  route("GET", "automations", setup.listAutomations),
  route("POST", "automations", editor.createAutomation),
  route("POST", "automations/check", editor.checkAutomation),
  route("PUT", "automations/:automationId", editor.changeAutomation),
  route("POST", "automations/:automationId/run", editor.runAutomationNow),
  route("GET", "automations/:automationId/runs", steps.listAutomationRuns),
  route("GET", "automations/:automationId", setup.getAutomation),
  route("PATCH", "automations/:automationId", setup.updateAutomation),
  route("DELETE", "automations/:automationId", setup.deleteAutomation),

  route("GET", "automation-drafts", drafts.listDrafts),
  route("POST", "automation-drafts", editor.createDraft),
  route("GET", "automation-drafts/:draftId", drafts.getDraft),
  route("POST", "automation-drafts/:draftId/save", drafts.saveDraft),
  route("POST", "automation-drafts/:draftId/discard", drafts.discardDraft),

  route("GET", "pr-reviews", crew.listPrReviews),
  route("PUT", "pr-reviews/:owner/:repo", crew.enablePrReview),
  route("DELETE", "pr-reviews/:owner/:repo", crew.disablePrReview),

  route("GET", "agent/status", setup.getAgentStatus),
  route("POST", "agent/prewarm", setup.prewarmAgent),
  route("GET", "agent/settings", setup.getAgentSettings),
  route("PATCH", "agent/settings", setup.updateAgentSettings),
  route("POST", "agent/claude/login", setup.startClaudeLogin),
  route("POST", "agent/claude/login/:loginId/complete", setup.completeClaudeLogin),
  route("DELETE", "agent/claude", setup.disconnectClaude),
  route("GET", "crew", crew.listCrew),

  route("GET", "memories", memory.listMemories),
  route("DELETE", "memories", memory.deleteAllMemories),
  route("DELETE", "memories/:memoryId", memory.deleteMemory),

  route("GET", "billing/plans", account.listPlans),
  route("GET", "billing/subscription", account.getSubscription),
  route("POST", "billing/checkout", account.createCheckout),
  route("POST", "billing/subscription/cancel", account.cancelSubscription),
  route("POST", "billing/subscription/resume", account.resumeSubscription),
  route("POST", "billing/portal", account.openBillingPortal),
  route("GET", "billing/auto-topup", account.getAutoTopUp),
  route("PUT", "billing/auto-topup", account.setAutoTopUp),

  route("GET", "credits", account.getCredits),
  route("GET", "credits/ledger", account.listLedger),
  route("GET", "usage", account.getUsage),
  route("POST", "coupons/redeem", account.redeemCoupon),

  route("GET", "activity", account.listActivity),
];

function matchParts(parts: readonly string[], segments: readonly string[]): Record<string, string> | null {
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(":")) params[parts[i].slice(1)] = segments[i];
    else if (parts[i] !== segments[i]) return null;
  }
  return params;
}

export function matchRoute(method: string, segments: readonly string[]): { handler: Handler; params: Record<string, string> } | null {
  for (const candidate of ROUTES) {
    if (candidate.method !== method) continue;
    const params = matchParts(candidate.parts, segments);
    if (params) return { handler: candidate.handler, params };
  }
  return null;
}
