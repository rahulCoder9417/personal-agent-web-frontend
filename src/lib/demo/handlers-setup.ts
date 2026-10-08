// Apps, own MCP servers, API keys, automations and agent settings for the demo account.

import type { AgentRuntime, AgentSettings, AiPreference, ByokKey, ByokProvider, McpServer } from "@/lib/api/client";
import { nowIso, type Handler } from "./context";
import {
  badRequest,
  conflict,
  json,
  noContent,
  notFound,
  oneOf,
  planLimit,
  readJson,
  requiredString,
  stringField,
} from "./http";
import { emit, logActivity, nextId, type DemoState } from "./store";

// ---------------------------------------------------------------- apps

export const listApps: Handler = ({ state }) => json({ items: state.apps });

/** The page to come back to after connecting; it has to be a page of this app. */
function readReturnUrl(raw: unknown, origin: string): URL {
  if (raw === undefined) return new URL("/connected", origin);
  if (typeof raw !== "string" || !URL.canParse(raw)) throw badRequest("returnUrl must be a URL");
  const url = new URL(raw);
  if (url.origin !== origin) throw badRequest("returnUrl must be a page of this app");
  return url;
}

export const connectApp: Handler = async ({ state, request, params, url }) => {
  const app = state.apps.find((item) => item.slug === params.appSlug);
  if (!app) throw notFound("That app isn't in the catalog");
  if (!app.availableOnPlan) throw planLimit(`${app.name} isn't included in your plan`);

  const body = await readJson(request, { optional: true });
  const redirectUrl = readReturnUrl(body.returnUrl, url.origin);
  redirectUrl.searchParams.set("app", app.slug);

  // There's no provider to sign in to, so the app counts as connected straight away.
  app.connections = app.connections.filter((connection) => connection.status === "active");
  if (app.connections.length === 0) {
    app.connections.push({ id: nextId(state, "con"), accountLabel: "Connected just now", status: "active" });
  }
  return json({ redirectUrl: redirectUrl.toString() });
};

export const disconnectApp: Handler = ({ state, params }) => {
  const app = state.apps.find((item) => item.connections.some((connection) => connection.id === params.connectionId));
  if (!app) throw notFound("That connection doesn't exist");
  app.connections = app.connections.filter((connection) => connection.id !== params.connectionId);
  return noContent();
};

// ---------------------------------------------------------------- own MCP servers

export const listMcpServers: Handler = ({ state }) => json({ items: state.mcpServers });

function findServer(state: DemoState, id: string): McpServer {
  const server = state.mcpServers.find((item) => item.id === id);
  if (!server) throw notFound("That MCP server doesn't exist");
  return server;
}

export const createMcpServer: Handler = async ({ state, request }) => {
  if (state.user.plan !== "max") throw planLimit("Your own MCP servers are part of the Max plan");
  const body = await readJson(request);
  const name = requiredString(body, "name", { min: 1, max: 60 }).trim();
  const url = requiredString(body, "url");
  if (!name) throw badRequest("name can't be empty");
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") throw badRequest("url must start with https://");
  stringField(body, "authHeaderName", { max: 100 });
  const secret = stringField(body, "authSecret");

  const server: McpServer = {
    id: nextId(state, "mcp"),
    name,
    url,
    enabled: true,
    hasSecret: Boolean(secret),
    lastError: null,
    createdAt: nowIso(),
  };
  state.mcpServers.push(server);
  return json(server, 201);
};

export const updateMcpServer: Handler = async ({ state, request, params }) => {
  const server = findServer(state, params.mcpServerId);
  const body = await readJson(request);
  const name = stringField(body, "name", { min: 1, max: 60 });
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") throw badRequest("enabled must be true or false");
  if (name !== undefined) server.name = name;
  if (typeof body.enabled === "boolean") server.enabled = body.enabled;
  return json(server);
};

export const deleteMcpServer: Handler = ({ state, params }) => {
  const server = findServer(state, params.mcpServerId);
  state.mcpServers = state.mcpServers.filter((item) => item !== server);
  return noContent();
};

// ---------------------------------------------------------------- agent and AI

const PROVIDERS: readonly ByokProvider[] = ["anthropic", "openai", "openrouter"];
const RUNTIMES: readonly AgentRuntime[] = ["hermes", "claude_code"];
const AI_PREFERENCES: readonly AiPreference[] = ["auto", "platform"];
const CLAUDE_LOGIN_MINUTES = 10;

/**
 * Works out what runs and what pays for the AI, by the backend's rule, in order:
 * 0. Textcrew AI on offer and chosen → Hermes, paid in credits, whatever else is set up
 * 1. a connected Claude plan and Claude Code chosen → Claude Code, on the plan
 * 2. an own API key → Hermes, on the key
 * 3. Textcrew AI on offer → Hermes, paid in credits
 * 4. it isn't, but a Claude plan is connected → Claude Code, because the plan is the only AI there is
 * 5. otherwise nothing runs
 */
function syncAgentSettings(state: DemoState): void {
  const settings = state.agentSettings;
  const ownKeyProviders = state.byok.filter((key) => key.set).map((key) => key.provider);
  const connected = settings.claude.connected;
  const runtime = connected ? settings.runtime : "hermes";
  const platformAvailable = state.aiMode === "platform";

  let access: Pick<AgentSettings, "effectiveRuntime" | "aiAccess">;
  if (platformAvailable && settings.aiPreference === "platform") access = { effectiveRuntime: "hermes", aiAccess: "platform" };
  else if (connected && runtime === "claude_code") access = { effectiveRuntime: "claude_code", aiAccess: "claude_plan" };
  else if (ownKeyProviders.length > 0) access = { effectiveRuntime: "hermes", aiAccess: "own_key" };
  else if (platformAvailable) access = { effectiveRuntime: "hermes", aiAccess: "platform" };
  else if (connected) access = { effectiveRuntime: "claude_code", aiAccess: "claude_plan" };
  else access = { effectiveRuntime: null, aiAccess: "none" };

  state.agentSettings = { ...settings, runtime, ownKeyProviders, platformAvailable, ...access };
}

export const listByokKeys: Handler = ({ state }) => json({ items: state.byok });

/** The model a provider's key uses when none is named, as the backend picks it. */
const DEFAULT_MODEL: Record<ByokProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-6.1-sol",
  openrouter: "anthropic/claude-sonnet-5.5",
};

/** As in the backend: of the saved keys, the one saved last pays for the AI. */
function markKeyInUse(state: DemoState): void {
  const saved = state.byok.filter((key) => key.set).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  for (const key of state.byok) {
    key.inUse = key === saved[0];
    key.effectiveModel = key.model || DEFAULT_MODEL[key.provider];
  }
}

function findKey(state: DemoState, provider: string): ByokKey {
  const name = oneOf(provider, PROVIDERS, "provider");
  return state.byok.find((key) => key.provider === name) as ByokKey;
}

export const setByokKey: Handler = async ({ state, request, params }) => {
  const key = findKey(state, params.provider);
  const body = await readJson(request);
  const apiKey = requiredString(body, "apiKey").trim();
  if (apiKey.length < 10) throw badRequest("That key is too short to be a real one. Check it and paste it again.");
  const model = stringField(body, "model", { max: 100 })?.trim();

  key.set = true;
  key.last4 = apiKey.slice(-4);
  key.model = model || key.model || null;
  key.updatedAt = nowIso();
  markKeyInUse(state);
  syncAgentSettings(state);
  return json(key);
};

export const deleteByokKey: Handler = ({ state, params }) => {
  const key = findKey(state, params.provider);
  Object.assign(key, { set: false, last4: null, model: null, updatedAt: null });
  markKeyInUse(state);
  syncAgentSettings(state);
  return noContent();
};

export const getAgentStatus: Handler = ({ state }) => json(state.agentStatus);

export const getAgentSettings: Handler = ({ state }) => {
  syncAgentSettings(state);
  return json(state.agentSettings);
};

/** The agent, the AI preference, or both. Textcrew AI can only be chosen while it is on offer. */
export const updateAgentSettings: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const names = Object.keys(body);
  if (names.length === 0 || names.some((name) => name !== "runtime" && name !== "aiPreference")) {
    throw badRequest("Send runtime, aiPreference or both");
  }
  const runtime = body.runtime === undefined ? undefined : oneOf(body.runtime, RUNTIMES, "runtime");
  const aiPreference = body.aiPreference === undefined ? undefined : oneOf(body.aiPreference, AI_PREFERENCES, "aiPreference");

  syncAgentSettings(state);
  if (runtime === "claude_code" && !state.agentSettings.claude.connected) {
    throw conflict("Connect your Claude plan first, then choose Claude Code");
  }
  if (aiPreference === "platform" && !state.agentSettings.platformAvailable) {
    throw conflict("Textcrew AI isn't on offer here. Use your own API key or your Claude plan");
  }
  if (runtime) state.agentSettings.runtime = runtime;
  if (aiPreference && aiPreference !== state.agentSettings.aiPreference) {
    state.agentSettings.aiPreference = aiPreference;
    logActivity(state, {
      actor: "user",
      action: "ai_preference_changed",
      summary: aiPreference === "platform" ? "Chose Textcrew AI (paid in credits)" : "Went back to their own AI",
    });
  }
  syncAgentSettings(state);
  return json(state.agentSettings);
};

export const startClaudeLogin: Handler = ({ state }) => {
  const loginId = nextId(state, "login");
  const expiresAt = new Date(Date.now() + CLAUDE_LOGIN_MINUTES * 60_000).toISOString();
  state.claudeLogins[loginId] = expiresAt;
  return json({ loginId, authorizeUrl: "https://claude.ai/oauth/authorize?demo=1", expiresAt }, 201);
};

export const completeClaudeLogin: Handler = async ({ state, request, params }) => {
  const expiresAt = state.claudeLogins[params.loginId];
  if (!expiresAt) throw notFound("That sign-in wasn't started here. Start again.");
  const body = await readJson(request);
  if (Object.keys(body).some((name) => name !== "code")) throw badRequest("Only code is expected");
  const code = requiredString(body, "code", { max: 2000 }).trim();
  if (Date.parse(expiresAt) <= Date.now()) throw badRequest("That code has expired. Start the sign-in again.");
  if (code.length < 4) throw badRequest("That code doesn't look right. Copy it again from Anthropic's page.");

  delete state.claudeLogins[params.loginId];
  state.agentSettings.claude = { connected: true, connectedAt: nowIso() };
  state.agentSettings.runtime = "claude_code";
  // They have just chosen their Claude plan, so an earlier choice of Textcrew AI is dropped.
  state.agentSettings.aiPreference = "auto";
  syncAgentSettings(state);
  return json(state.agentSettings);
};

export const disconnectClaude: Handler = ({ state }) => {
  state.agentSettings.claude = { connected: false, connectedAt: null };
  syncAgentSettings(state);
  return noContent();
};

// ---------------------------------------------------------------- automations

export const listAutomations: Handler = ({ state }) => json({ items: state.automations });

export const updateAutomation: Handler = async ({ state, request, params }) => {
  const automation = state.automations.find((item) => item.id === params.automationId);
  if (!automation) throw notFound("That automation doesn't exist");
  const body = await readJson(request);
  if (typeof body.enabled !== "boolean") throw badRequest("enabled must be true or false");

  automation.enabled = body.enabled;
  automation.pausedReason = body.enabled ? null : "user";
  emit(state, "automation.updated", automation);
  return json(automation);
};

export const deleteAutomation: Handler = ({ state, params }) => {
  const index = state.automations.findIndex((item) => item.id === params.automationId);
  if (index === -1) throw notFound("That automation doesn't exist");
  state.automations.splice(index, 1);
  // A repo with pull-request review on is gone with its automation.
  state.prReviews = state.prReviews.filter((review) => review.automationId !== params.automationId);
  return noContent();
};
