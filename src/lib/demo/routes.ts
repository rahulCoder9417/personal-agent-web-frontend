// Which handler answers which request. Paths are relative to /v1, with `:name` for a path parameter.

import type { Handler } from "./context";
import * as account from "./handlers-account";
import * as chat from "./handlers-chat";
import * as crew from "./handlers-crew";
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
  route("POST", "attachments", chat.uploadAttachment),
  route("GET", "stream", chat.openStream),

  route("GET", "approvals", chat.listApprovals),
  route("POST", "approvals/:approvalId/decision", chat.decideApproval),

  route("GET", "apps", setup.listApps),
  route("POST", "apps/:appSlug/connect", setup.connectApp),
  route("DELETE", "connections/:connectionId", setup.disconnectApp),

  route("GET", "mcp-servers", setup.listMcpServers),
  route("POST", "mcp-servers", setup.createMcpServer),
  route("PATCH", "mcp-servers/:mcpServerId", setup.updateMcpServer),
  route("DELETE", "mcp-servers/:mcpServerId", setup.deleteMcpServer),

  route("GET", "byok", setup.listByokKeys),
  route("PUT", "byok/:provider", setup.setByokKey),
  route("DELETE", "byok/:provider", setup.deleteByokKey),

  route("GET", "automations", setup.listAutomations),
  route("PATCH", "automations/:automationId", setup.updateAutomation),
  route("DELETE", "automations/:automationId", setup.deleteAutomation),

  route("GET", "pr-reviews", crew.listPrReviews),
  route("PUT", "pr-reviews/:owner/:repo", crew.enablePrReview),
  route("DELETE", "pr-reviews/:owner/:repo", crew.disablePrReview),

  route("GET", "agent/status", setup.getAgentStatus),
  route("GET", "agent/settings", setup.getAgentSettings),
  route("PATCH", "agent/settings", setup.updateAgentSettings),
  route("POST", "agent/claude/login", setup.startClaudeLogin),
  route("POST", "agent/claude/login/:loginId/complete", setup.completeClaudeLogin),
  route("DELETE", "agent/claude", setup.disconnectClaude),
  route("GET", "crew", crew.listCrew),

  route("GET", "billing/plans", account.listPlans),
  route("GET", "billing/subscription", account.getSubscription),
  route("POST", "billing/checkout", account.createCheckout),
  route("POST", "billing/subscription/cancel", account.cancelSubscription),

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
