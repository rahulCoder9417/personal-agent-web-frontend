#!/usr/bin/env node
// Runs the REAL Textcrew backend (api + worker) on this machine with nothing to install:
// embedded Postgres, a throwaway Redis, and stand-ins for the services it calls out to.
//
//   pnpm backend:local
//
// What is real: every /v1 route, the OpenAPI validation, the database, the job queues, credits,
// approvals, automations, the Polar webhook handling.
// What is a stand-in: the agent (a small script that answers, asks for approval, sets reminders
// and proposes automation drafts), Composio, LiteLLM, Telegram, and Polar's hosted checkout (a
// local page whose "Pay" button sends the same signed webhooks Polar would).
//
// It prints a session token for a seeded user. Put it in .env.local as TEXTCREW_DEV_TOKEN and the
// app talks to this backend without Clerk. Data is wiped on every start.
//
// Needs the backend checked out next to this repo (../beckend, or TEXTCREW_BACKEND_DIR) with its
// dependencies installed, and `redis-server` on the PATH.

import { createSign, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BACKEND = path.resolve(process.env.TEXTCREW_BACKEND_DIR ?? path.join(import.meta.dirname, "..", "..", "beckend"));
const PORT = Number(process.env.TEXTCREW_API_PORT ?? 8080);
const WEB = (process.env.TEXTCREW_WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const API = `http://localhost:${PORT}`;
const TELEGRAM_CHAT = 424242;

if (!existsSync(path.join(BACKEND, "src", "api", "app.ts"))) {
  console.error(`No backend at ${BACKEND}. Set TEXTCREW_BACKEND_DIR to the backend repo.`);
  process.exit(1);
}

const from = (file) => pathToFileURL(path.join(BACKEND, file)).href;
// The backend is TypeScript run through tsx; register its loader, then import its modules by path.
(await import(from("node_modules/tsx/dist/esm/api/index.mjs"))).register();
const load = (file) => import(from(file));

// ---------------------------------------------------------------- infrastructure

console.log("Starting Postgres and Redis…");
const provided = {};
const stopInfra = await (await load("test/global-setup.ts")).default({ provide: (key, value) => (provided[key] = value) });

// Session tokens are checked against this key instead of Clerk's, so no Clerk account is needed.
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

Object.assign(process.env, {
  NODE_ENV: "development",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
  PORT: String(PORT),
  DATABASE_URL: provided.pgAdminUrl,
  REDIS_URL: provided.redisUrl,
  QUEUE_PREFIX: "local",
  ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  VM_INTERNAL_SECRET: randomBytes(24).toString("hex"),
  CLERK_JWT_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
  PUBLIC_API_URL: API,
  WEB_APP_URL: WEB,
  TELEGRAM_WEBHOOK_SECRET: "local-telegram-secret",
  TELEGRAM_BOT_USERNAME: "textcrew_local_bot",
  ATTACHMENTS_DIR: mkdtempSync(path.join(tmpdir(), "textcrew-attachments-")),
  COMPOSIO_AUTH_CONFIGS: JSON.stringify(
    Object.fromEntries(
      ["gmail", "googlecalendar", "googledrive", "googledocs", "googlesheets", "notion", "todoist", "slack", "github", "linear", "hubspot", "trello", "asana", "airtable"].map(
        (slug) => [slug, `ac_local_${slug}`],
      ),
    ),
  ),
});
// These must not leak in from the shell: the checks they switch on have no counterpart here.
delete process.env.CLERK_AUTHORIZED_PARTIES;
delete process.env.CLERK_SECRET_KEY;

// Sets the Polar product ids and webhook secret used below (and a fake LiteLLM master key).
const billingFakes = await load("test/billing-fakes.ts");
const polarFakes = await load("test/polar-fakes.ts");
const fakes = await load("test/fakes.ts");

await (await load("src/shared/db/migrate.ts")).runMigrations();

// ---------------------------------------------------------------- stand-ins

const { DeliverKind } = await load("proto-gen/vm/v1/vm_pb.ts");

/** The stand-in agent's last draft in each chat, so "make it 8:30 instead" proposes a newer version of it. */
const lastDraftIds = new Map();

/**
 * Proposes an automation, as Tex does for anything more than a plain reminder: the platform posts
 * the draft (a card in web chat; an outline, the link and ✅ Save on Telegram) and the turn ends.
 * Only the user saves it.
 */
async function propose(mcp, delivery, parts) {
  const made = await mcp("propose_automation", { ...parts, session_key: delivery.sessionKey });
  if (made.isError) return mcp("send_message", { text: `I couldn’t draft that: ${made.text}`, session_key: delivery.sessionKey });
  lastDraftIds.set(delivery.sessionKey, JSON.parse(made.text).draft_id);
}

/** The scripted agent. It uses the same platform tools a real agent would. */
async function agent(delivery, mcp) {
  const say = (text) => mcp("send_message", { text, session_key: delivery.sessionKey });
  const text = delivery.text ?? "";

  if (delivery.kind === DeliverKind.APPROVAL_ANSWER) {
    if (!delivery.approved) return say("Okay, I won’t do that. Want me to change anything?");
    const result = await mcp("run_app_action", { action: "GMAIL_SEND_EMAIL", arguments: EMAIL, approval_id: delivery.approvalId });
    return say(result.isError ? `That didn’t go through: ${result.text}` : "Done. It’s sent.");
  }
  // "Run once now": the platform marks the run as a test; the answer says so.
  if (delivery.kind === DeliverKind.AUTOMATION && text.startsWith("[Test run"))
    return say(`Test run: here’s what this automation would send. ${text.replace(/^\[[^\]]*\]\s*/, "")}`);
  if (delivery.kind === DeliverKind.AUTOMATION) return say(`Here’s your scheduled update: ${text}`);

  // "Change this draft (drf_…): …" from the canvas's "Ask Tex to change this": read the person's
  // own version and propose it again (an hour later when they ask for "later"), replacing it.
  const asked = /Change this draft \((drf_[a-z0-9]+)\)/i.exec(text);
  if (asked) {
    const read = await mcp("get_automation_draft", { draft_id: asked[1] });
    if (read.isError) return say(`I couldn’t read that draft: ${read.text}`);
    const d = JSON.parse(read.text);
    const later = /\blater\b/i.test(text) && d.cron ? d.cron.replace(/^(\S+) (\d+)/, (_, m, h) => `${m} ${(Number(h) + 1) % 24}`) : d.cron;
    return propose(mcp, delivery, {
      title: d.title,
      instruction: d.instruction || "Do what the title says.",
      ...(d.runAt ? { run_at: d.runAt } : {}),
      ...(d.cron ? { cron: later } : {}),
      ...(d.trigger ? { trigger: d.trigger } : {}),
      timezone: d.timezone,
      apps: d.apps,
      ask_first: d.askFirst,
      replaces_draft_id: d.id,
    });
  }

  // Schedules first: "every Monday, send me my week" is an automation, not an email.
  if (/\bevery (monday|week|weekday|day|morning)\b/i.test(text)) {
    return propose(mcp, delivery, {
      title: "Send me my week",
      instruction: "Read my calendar and inbox and send a short summary.",
      cron: "0 9 * * 1",
      timezone: "Asia/Kolkata",
      apps: ["googlecalendar", "gmail"],
    });
  }
  // "When my boss emails me, tell me": an app event.
  if (/\bwhen\b.*\b(email|emails|mail)\b/i.test(text)) {
    return propose(mcp, delivery, {
      title: "Boss emails",
      instruction: "Tell me who wrote and what they want, in two lines.",
      trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: { from: "boss@northwind.studio" } },
      apps: ["gmail"],
    });
  }
  // "Make it 8:30 instead": a newer version of the last draft, which it replaces.
  if (lastDraftIds.has(delivery.sessionKey) && /\b(instead|make it)\b/i.test(text)) {
    return propose(mcp, delivery, {
      title: "Send me my week",
      instruction: "Read my calendar and inbox and send a short summary.",
      cron: "30 8 * * 1",
      timezone: "Asia/Kolkata",
      apps: ["googlecalendar", "gmail"],
      replaces_draft_id: lastDraftIds.get(delivery.sessionKey),
    });
  }
  if (/\bremind\b/i.test(text)) {
    const made = await mcp("schedule_reminder", {
      text: text.slice(0, 200),
      run_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      session_key: delivery.sessionKey,
    });
    return say(made.isError ? `I couldn’t set that reminder: ${made.text}` : "I’ll remind you tomorrow at this time.");
  }
  if (/\b(email|send|post|reply)\b/i.test(text)) {
    await mcp("request_approval", {
      summary: "Send this email to Maya",
      action: "GMAIL_SEND_EMAIL",
      arguments: EMAIL,
      session_key: delivery.sessionKey,
    });
    return say("I’ve drafted a note to Maya. It needs your OK before I send it.");
  }
  return say(`This is the local stand-in agent, so nothing was really done, but the backend handled “${text.slice(0, 120)}” end to end.`);
}

const EMAIL = { to: "maya@acme.com", subject: "Moving today’s 3pm", body: "Hi Maya, could we move today’s 3pm to tomorrow, same time? Thanks!" };

fakes.installFakeVm(agent);
/** What the bot "sent" to Telegram: the stand-in keeps it, buttons and all. */
const telegram = fakes.installFakeTelegram();
await fakes.installFakeComposio();
// Any key is accepted, except one containing "bad" (to see the rejection).
(await load("src/modules/integrations/byok.ts")).setByokVerifier(async (_provider, key) => !key.includes("bad"));

// Polar: checkouts land on a local page; paying sends the webhooks Polar would.
const checkouts = new Map();
(await load("src/modules/billing/polar.ts")).setPolarClient({
  async createCheckout(input) {
    const checkoutId = randomUUID();
    checkouts.set(checkoutId, input);
    return { checkoutId, checkoutUrl: `${API}/__local/polar/checkout/${checkoutId}` };
  },
  // The backend marks the subscription itself; Polar would only confirm it.
  async cancelAtPeriodEnd() {},
});

async function sendPolarWebhook(payload) {
  const signed = polarFakes.signPolar(payload);
  const response = await fetch(`${API}/webhooks/polar`, { method: "POST", headers: signed.headers, body: signed.body });
  if (!response.ok) throw new Error(`Polar webhook was refused: ${response.status}`);
}

/** What Polar does once the customer pays. */
async function payCheckout(input) {
  const { metadata } = input;
  const userId = input.externalCustomerId;
  if (metadata.kind === "topup") {
    await sendPolarWebhook(polarFakes.topUpOrder(userId, randomUUID()));
    return;
  }
  const max = metadata.plan_id === "max";
  const product = max ? polarFakes.PRODUCTS.max : polarFakes.PRODUCTS.pro;
  const list = max ? 3000 : 1200;
  const subscription = {
    userId,
    subId: randomUUID(),
    product,
    start: new Date(),
    end: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    metadata,
    discountId: input.discountId ?? null,
  };
  await sendPolarWebhook(polarFakes.subscriptionEvent("subscription.active", subscription));
  await sendPolarWebhook(
    polarFakes.orderPaid({ userId, orderId: randomUUID(), product, netAmount: input.discountId ? list / 2 : list, metadata }, subscription),
  );
}

// ---------------------------------------------------------------- local pages

const html = (body) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="darkreader-lock"><meta name="color-scheme" content="only light"><title>Local backend</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#151515;background:#fbfaf7}h1{font-size:20px}code,pre{background:#f3f1ec;padding:2px 6px;border-radius:6px}button,a.b{font:inherit;display:inline-block;padding:9px 18px;border-radius:999px;border:1px solid #151515;background:#151515;color:#fff;text-decoration:none;cursor:pointer}a.b.q{background:#fff;color:#151515;border-color:#d9d5cc}p.m{color:#6a6862}form{display:inline}</style>${body}`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

async function localRoute(request, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["__local", …]

  if (parts[1] === "polar" && parts[2] === "checkout" && parts[3]) {
    const checkout = checkouts.get(parts[3]);
    if (!checkout) return html("<h1>Unknown checkout</h1><p class=m>It was already paid, or the backend was restarted.</p>");
    const what = checkout.metadata.kind === "topup" ? "Top-up: 800 credits ($10)" : `${checkout.metadata.plan_id === "max" ? "Max ($30" : "Pro ($12"} per month)`;
    if (request.method === "POST") {
      checkouts.delete(parts[3]);
      await payCheckout(checkout);
      return Response.redirect(checkout.successUrl, 303);
    }
    return html(
      `<h1>Polar checkout (local stand-in)</h1><p>${what}${checkout.discountId ? " · waitlist discount applied" : ""}</p>
       <p class=m>For ${checkout.customerEmail ?? checkout.externalCustomerId}. No card is charged. “Pay” sends the backend the same signed webhooks Polar sends, then returns to <code>${checkout.successUrl}</code>.</p>
       <form method="post"><button>Pay</button></form> <a class="b q" href="${WEB}/billing">Cancel</a>`,
    );
  }

  // POST /__local/telegram  {"text": "LINK-ABCD-EFGH"}: a message from the seeded Telegram chat.
  if (parts[1] === "telegram" && !parts[2] && request.method === "POST") {
    const { text } = await request.json();
    const response = await fetch(`${API}/webhooks/telegram`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET },
      body: JSON.stringify(fakes.telegramUpdate(TELEGRAM_CHAT, String(text), "aarav_s")),
    });
    return Response.json({ delivered: response.ok });
  }

  // POST /__local/telegram/button  {"data": "drf:<id>:save"}: the seeded chat taps a button.
  if (parts[1] === "telegram" && parts[2] === "button" && request.method === "POST") {
    const { data } = await request.json();
    const response = await fetch(`${API}/webhooks/telegram`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET },
      body: JSON.stringify(fakes.telegramButton(TELEGRAM_CHAT, String(data))),
    });
    return Response.json({ delivered: response.ok });
  }

  // GET /__local/telegram/sent: what the bot sent to Telegram, with its buttons, newest last.
  if (parts[1] === "telegram" && parts[2] === "sent") return Response.json(telegram.sent);

  return html(
    `<h1>Textcrew local backend</h1><p>The real API on <code>${API}</code>, with stand-ins for the agent, Composio and Polar.</p>
     <p class=m>Send a Telegram message as the seeded chat (use it to finish a link code):</p>
     <pre>curl -X POST ${API}/__local/telegram -H 'content-type: application/json' -d '{"text":"LINK-XXXX-XXXX"}'</pre>
     <p class=m>See what the bot sent there, and tap a button under it (a draft's ✅ Save):</p>
     <pre>curl ${API}/__local/telegram/sent
curl -X POST ${API}/__local/telegram/button -H 'content-type: application/json' -d '{"data":"drf:…:save"}'</pre>`,
  );
}

// ---------------------------------------------------------------- start

const { createApp } = await load("src/api/app.ts");
const app = createApp();
const { serve } = await import(from("node_modules/@hono/node-server/dist/index.mjs"));
const server = serve({
  port: PORT,
  fetch: (request, ...rest) => {
    const url = new URL(request.url);
    return url.pathname.startsWith("/__local") ? localRoute(request, url) : app.fetch(request, ...rest);
  },
});

const { startWorkers } = await load("src/worker/runner.ts");
const workers = startWorkers((await load("src/worker/processors.ts")).processors(), { retryDelaysMs: [200, 500, 1000, 2000] });

// ---------------------------------------------------------------- seed

const EMAIL_ADDRESS = "aarav@northwind.studio";
const devUser = await load("scripts/dev-user.ts");
const created = await devUser.devUser(["create", "--email", EMAIL_ADDRESS, "--name", "Aarav Shah", "--plan", "free", "--credits", "300"]);
const userId = /user (\S+)/.exec(created[0])?.[1];

/** A session token the backend accepts for the seeded user (signed with the key generated above). */
function sessionToken(clerkId) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${part({ alg: "RS256", typ: "JWT", kid: "local" })}.${part({ sub: clerkId, sid: "sess_local", iat: now, nbf: now - 5, exp: now + 30 * 24 * 3600 })}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
}
const token = sessionToken(devUser.devClerkId(EMAIL_ADDRESS));

// Connected apps, as if the user had been through the providers' sign-in screens.
const { db } = await load("src/shared/db/client.ts");
const { connections } = await load("src/modules/integrations/tables.ts");
const { newId } = await load("src/shared/ids.ts");
for (const [appSlug, accountLabel, status] of [
  ["gmail", EMAIL_ADDRESS, "active"],
  ["googlecalendar", EMAIL_ADDRESS, "active"],
  ["notion", "Northwind workspace", "active"],
  ["github", "aarav-shah", "expired"],
]) {
  await db().insert(connections).values({ id: newId("con"), userId, app: appSlug, composioAccountId: `ca_local_${appSlug}`, accountLabel, status });
}

const asUser = (pathname, init = {}) =>
  fetch(`${API}${pathname}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
const send = (text) => asUser("/v1/messages", { method: "POST", body: JSON.stringify({ text, clientMessageId: randomUUID() }) });
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A linked Telegram chat, a few messages, one pending approval and one automation draft in each
// of web chat and Telegram (nothing runs until the user saves one).
const link = await (await asUser("/v1/channels/link-codes", { method: "POST", body: JSON.stringify({ channel: "telegram" }) })).json();
await fetch(`${API}/__local/telegram`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: link.code }) });
await settle(1500);
await send("Every Monday at 9am, send me my week");
await settle(2500);
await send("Email Maya that our 3pm moves to tomorrow");
await settle(2500);
await fetch(`${API}/__local/telegram`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "When my boss emails me, tell me" }) });
await settle(2500);

const balance = (await (await asUser("/v1/me")).json()).credits?.balance;

console.log(`
Textcrew backend is running.

  API            ${API}            (local pages: ${API}/__local)
  Seeded user    Aarav Shah <${EMAIL_ADDRESS}> · Free plan · ${balance} credits
  Web app        ${WEB}   (Polar returns to ${WEB}/billing?checkout=done)

Put this in the app's .env.local, then run pnpm dev:

TEXTCREW_API_URL=${API}
TEXTCREW_DEV_TOKEN=${token}

Ctrl+C stops it and deletes the data.
`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([
    (await load("src/modules/events/queues.ts")).closeQueues(),
    (await load("src/shared/redis.ts")).closeRedis(),
    (await load("src/shared/db/client.ts")).closeDb(),
  ]);
  await stopInfra();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
void billingFakes;
