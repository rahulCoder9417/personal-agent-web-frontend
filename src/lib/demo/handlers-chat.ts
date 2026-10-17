// Chat, attachments and approvals for the demo account, including Tex's delayed answers.

import type { Approval, ApprovalStatus, Attachment, ChannelType, Conversation, Message, SkipOffer, SkipRule, SkipScope } from "@/lib/api/client";
import { ruleScopeLine } from "@/lib/approvals";
import { CHANNEL_LABEL, titleCase } from "@/lib/format";
import { lowerFirst, nowIso, truncate, upperFirst, type Handler } from "./context";
import {
  badRequest,
  channelDisabled,
  conflict,
  HttpError,
  json,
  noContent,
  notFound,
  oneOf,
  outOfCredits,
  paginate,
  readJson,
  requiredString,
  stringField,
  type JsonObject,
} from "./http";
import {
  activeConversation,
  activeWebConversation,
  automationsChat,
  findConversation,
  makeActive,
  messageSaved,
  startWebConversation,
} from "./handlers-conversations";
import { proposalOf, proposeDraft } from "./handlers-drafts";
import { memoryRequestOf, rememberFact } from "./handlers-memory";
import { syncAgentSettings } from "./handlers-setup";
import { BYTE_REPLY, SCOUT_REPLY } from "./replies";
import type { SpecialistId } from "./seed";
import { balanceOf, chargeAppAction, chargePaidTool, chargeUsage, emit, logActivity, nextId, schedule, setAgentState, type DemoState } from "./store";
import { streamResponse } from "./stream";

const CHANNELS: readonly ChannelType[] = ["whatsapp", "telegram", "imessage", "web"];
const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "rejected", "expired", "replaced", "auto_approved"];
const SKIP_SCOPES: readonly SkipScope[] = ["listed", "anyone", "action"];
/** As the backend: at most this many rules, and this many recipients on one. */
const MAX_SKIP_RULES = 50;
const MAX_SKIP_RECIPIENTS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTACHMENTS = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DAY_MS = 86_400_000;

// How long Tex "thinks" before each step.
const PICKUP_MS = 300;
const ANSWER_MS = 1500;
const FOLLOW_UP_MS = 900;
/** How long a specialist takes over each step it reports. */
const CREW_STEP_MS = 1300;
/** How often Tex's answer grows on screen while it writes it (`message.draft`). */
const DRAFT_STEP_MS = 50;
/** What a demo answer costs in AI when Tex runs on Textcrew AI. */
const TEXTCREW_AI_CREDITS = 2;

// ---------------------------------------------------------------- messages

/**
 * One conversation's messages when `conversationId` is given. Without it: the active web
 * conversation's for `channel=web`, a chat app's for another channel, and every message otherwise.
 */
export const listMessages: Handler = ({ state, url }) => {
  const raw = url.searchParams.get("channel");
  const channel = raw === null ? null : oneOf(raw, CHANNELS, "channel");
  const conversationId = url.searchParams.get("conversationId");
  const activeWeb = activeWebConversation(state);

  let items = state.messages;
  if (conversationId !== null) {
    if (!findConversation(state, conversationId)) throw notFound("That conversation doesn't exist");
    items = items.filter((message) => message.conversationId === conversationId);
  } else if (channel === "web") {
    items = items.filter((message) => message.conversationId === activeWeb?.id);
  } else if (channel) {
    items = items.filter((message) => message.channel === channel);
  }
  // Kept for compatibility: when the web chat's latest new chat started, null if there never was one.
  const chatStartedAt = activeWeb && activeWeb.epoch > 0 ? activeWeb.startedAt : null;
  return json({ ...paginate(items, url), chatStartedAt });
};

function readAttachments(state: DemoState, body: JsonObject): Attachment[] {
  const ids = body.attachmentIds;
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw badRequest("attachmentIds must be a list of ids");
  if (ids.length > MAX_ATTACHMENTS) throw badRequest(`A message can carry ${MAX_ATTACHMENTS} files at most`);
  return (ids as string[]).map((id) => {
    const attachment = state.attachments[id];
    if (!attachment) throw badRequest(`Attachment ${id} wasn't found`);
    return attachment;
  });
}

function setMessageStatus(state: DemoState, id: string, status: Message["status"]): void {
  const message = state.messages.find((m) => m.id === id);
  if (!message) return;
  message.status = status;
  emit(state, "message.status", message);
}

/**
 * Tex says something in a conversation. Nothing is said in one that was deleted in the meantime.
 * `turnId`: the turn it is said in, as the backend marks it (the request's own `turnId`).
 */
export function postFromTex(
  state: DemoState,
  conversationId: string,
  text: string,
  approvalId: string | null = null,
  automationDraftId: string | null = null,
  turnId: string | null = null,
): void {
  const conversation = findConversation(state, conversationId);
  if (!conversation) return;
  const message: Message = {
    id: nextId(state, "msg"),
    conversationId: conversation.id,
    channel: conversation.channel,
    direction: "out",
    text,
    status: "sent",
    approvalId,
    // A draft Tex proposed: the web app draws its card under the line (as the backend sends it).
    ...(automationDraftId ? { automationDraftId } : {}),
    ...(turnId ? { turnId } : {}),
    createdAt: nowIso(),
  };
  state.messages.unshift(message);
  emit(state, "message.created", message);
  messageSaved(state, message);
}

type Risk = { app: string; action: string; reason: string };

/** Requests that touch other people, delete things or post in public wait for an OK, as in the product. */
function riskOf(text: string): Risk | null {
  if (/\bdelete\b/i.test(text)) return { app: "gmail", action: "GMAIL_DELETE", reason: "Deletes things" };
  if (/\bpost\b/i.test(text)) return { app: "slack", action: "SLACK_SEND_MESSAGE", reason: "Posts where others see it" };
  if (/\b(e-?mail|send)\b/i.test(text)) return { app: "gmail", action: "GMAIL_SEND_EMAIL", reason: "Sends to someone else" };
  return null;
}

/** "GMAIL_SEND_EMAIL" → "Send email", as the backend words an action (its app's prefix left out). */
const actionWords = (action: string) => upperFirst(action.split("_").slice(1).join(" ").toLowerCase());

/**
 * What the card's "Don't ask again for this…" offers, as the backend works it out (OpenAPI SkipOffer):
 * nothing for deleting or paying; a demo request names nobody, so "anyone" is the one choice.
 */
function skipOfferOf(risk: Risk): SkipOffer | null {
  if (/(^|_)(DELETE|REMOVE|TRASH|ARCHIVE|PAY|PAYMENT|TRANSFER|CHARGE|REFUND|MERGE)(_|$)/.test(risk.action)) return null;
  return { actionName: actionWords(risk.action), recipients: [], target: "people", scopes: ["anyone"] };
}

/** The user's rule that lets this demo request run without a card: one that names nobody matches "anyone" (or "this action"). */
function ruleFor(state: DemoState, risk: Risk): SkipRule | null {
  if (!skipOfferOf(risk)) return null;
  return state.skipRules.find((rule) => rule.action === risk.action && (rule.scope === "anyone" || rule.scope === "action")) ?? null;
}

/** As the backend does it: a request the user's skip rule covers runs at once, with no card, and is kept as auto-approved. */
function runBySkipRule(state: DemoState, request: Message, risk: Risk, rule: SkipRule): void {
  const at = nowIso();
  const charged = chargeAppAction(state, risk.action);
  const approval: Approval = {
    id: nextId(state, "ap"),
    kind: "app_action",
    status: "auto_approved",
    summary: upperFirst(truncate(request.text, 70)),
    app: risk.app,
    action: risk.action,
    details: { arguments: { body: request.text } },
    createdAt: at,
    expiresAt: at,
    decidedAt: at,
    skip: null,
    skipRule: { id: rule.id, scope: rule.scope, recipients: rule.recipients },
    run: { state: "done", at, result: '{"ok":true}', error: null, creditsCharged: charged },
  };
  state.approvals.unshift(approval);
  emit(state, "approval.resolved", approval);
  logActivity(state, { actor: "agent", action: "run_app_action", summary: `Ran ${risk.action} without asking (your skip rule)`, creditsCharged: charged });
  postFromTex(state, request.conversationId, "Done. I didn’t ask first: your skip rule covers this. It’s under Approvals → Auto-approved.", null, null, request.turnId ?? null);
}

function askForApproval(state: DemoState, request: Message, risk: Risk): void {
  const rule = ruleFor(state, risk);
  if (rule) return runBySkipRule(state, request, risk, rule);
  const createdAt = nowIso();
  const approval: Approval = {
    id: nextId(state, "ap"),
    kind: "app_action",
    status: "pending",
    summary: upperFirst(truncate(request.text, 70)),
    app: risk.app,
    action: risk.action,
    details: { arguments: { body: request.text } },
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + DAY_MS).toISOString(),
    decidedAt: null,
    skip: skipOfferOf(risk),
  };
  state.approvals.unshift(approval);
  emit(state, "approval.created", approval);
  logActivity(state, { actor: "agent", action: "approval_requested", summary: `Asked to ${lowerFirst(approval.summary)}` });
  // As the backend does it: Tex's question is one message carrying the approval, made from its summary.
  postFromTex(state, request.conversationId, `I'd like to ${lowerFirst(approval.summary)}. Approve or Deny below.`, approval.id, null, request.turnId ?? null);
}

type CrewJob = { crew: SpecialistId; name: string; steps: string[]; reply: string };

// What each specialist is handed in the demo, the lines it reports while it works, and how Tex answers.
// Scout's and Byte's answers are written in Markdown (replies.ts); Patch's is a plain sentence.
const CREW_JOBS: readonly (CrewJob & { when: RegExp })[] = [
  {
    crew: "scout", name: "Scout", when: /\b(research|look up|look into|find out|search|compare)\b/i,
    steps: ["searching the web", "reading 3 pages", "done"],
    reply: SCOUT_REPLY,
  },
  {
    crew: "patch", name: "Patch", when: /\b(review|pull request|pr)\b/i,
    steps: ["reading the diff", "running the tests", "done"],
    reply: "Patch had a look. In the demo account no code is really reviewed, but this is where I’d give you its verdict.",
  },
  {
    crew: "byte", name: "Byte", when: /\b(code|bug|fix|script|refactor)\b/i,
    steps: ["reading the code", "writing the change", "done"],
    reply: BYTE_REPLY,
  },
];

/** The specialist a request goes to, if one fits and it works on this deployment. */
function crewJobOf(state: DemoState, text: string): CrewJob | null {
  return CREW_JOBS.find((job) => job.when.test(text) && state.crewAvailable.includes(job.crew)) ?? null;
}

/**
 * A progress line, as the backend passes it on: to the live stream for the web chat, and, because
 * it names a crew member, to the activity log. Nothing is sent to a chat app for it.
 */
function reportProgress(state: DemoState, job: CrewJob, step: string): void {
  const text = `${job.name}: ${step}`;
  emit(state, "agent.progress", { text, crew: job.crew, at: nowIso() });
  logActivity(state, { actor: "agent", action: "crew_progress", summary: text, crew: job.crew });
}

/**
 * A question about the day, worked through the way Tex really does it: a few words before each
 * tool, the draft started over when the tool runs (as the Bridge does), and then the answer. The
 * two short lines are never shown in web chat (too short, started over too soon); the long one is
 * shown, and kept as a step above the answer when Tex starts over.
 */
const DAY_TURN = {
  when: /\b(my day|inbox)\b/i,
  runs: [
    { text: "Let me check your calendar.", tool: "Checked your calendar" },
    { text: "Now your inbox.", tool: "Checked your inbox" },
    {
      text: "Two emails from Maya mention tomorrow’s review, so I’ll read both before I tell you what she needs from you.",
      tool: "Read 2 emails",
    },
  ],
  reply:
    "Today: “Roadmap sync” at 3pm with Maya and Dev, and the dentist at 5:30. Nothing before noon.\n\nMaya’s two emails ask for the Q3 numbers before tomorrow’s review, and whether 10am works for it. Want me to send her the numbers and say yes to 10?",
};
/** How long a short line is written, and stays, before Tex starts over for its tool. */
const SHORT_LINE_MS = [300, 250] as const;
/** How long the long line is written, and stays. */
const LONG_LINE_MS = [800, 700] as const;
/** How long each of the day turn's tools takes. */
const TOOL_MS = 700;

/**
 * A long turn, the way a real one goes when no app action fits: Tex looks at the apps twice, says it
 * will have Scout look on GitHub itself, and reads one page after another, each its own "Read a web
 * page" step, with a search between them, before it answers. The thread folds the steps that repeat
 * into one line each, and the trail is still long enough to fold its earlier lines.
 */
const PAGE = "Read a web page";
const ISSUES_TURN = {
  when: /\bopen issues\b/i,
  apps: ["Looked at your apps", "Looked at your apps"],
  line: "The GitHub app has no “list issues” action, so I’ll have Scout look them up directly on GitHub.",
  scout: "Scout: List open issues in acme/web",
  reads: [...Array.from({ length: 6 }, () => PAGE), "Searched the web", ...Array.from({ length: 10 }, () => PAGE)],
  reply:
    "acme/web has three open issues:\n\n1. **Login button misaligned on Safari** (#118)\n2. **Export to CSV drops the last row** (#121)\n3. **Dark mode flickers on load** (#124)\n\nIn the demo account nothing is really looked up, but this is where the real list would be.",
};
/** How long the long turn takes over each app it looks at, and over each page it reads. */
const APP_LOOK_MS = 600;
const PAGE_MS = 450;

/** The backend's answer to a message when there is no AI to run the agent on (`turn.ts`), before the address. */
export const NO_AI_REPLY = "Connect your own AI first: add an API key or connect your Claude plan at";

/** Tex's answer to a request that isn't a fact to remember, a risky action or a job for the crew. */
function plainReply(text: string): string {
  return `Got it. In the demo account nothing is really done, but this is where I’d tell you how “${truncate(text, 80)}” went.`;
}

/**
 * The words Tex will answer a request with, when they are known ahead: so they can be written on
 * screen before they are posted. A fact to remember is answered as it is saved, and a risky request
 * with an approval card, so neither is written ahead.
 */
function plannedReply(request: Message, job: CrewJob | null): string | null {
  if (memoryRequestOf(request.text) || riskOf(request.text)) return null;
  if (job) return job.reply;
  if (ISSUES_TURN.when.test(request.text)) return ISSUES_TURN.reply;
  return DAY_TURN.when.test(request.text) ? DAY_TURN.reply : plainReply(request.text);
}

/**
 * Where the drafts of `text` end, one per step: a little further each time, always at the end of a
 * word, the last one at the end of the text.
 */
export function draftCuts(text: string, steps: number): number[] {
  const cuts: number[] = [];
  for (let step = 1; step <= steps; step++) {
    let end = Math.ceil((text.length * step) / steps);
    while (end < text.length && !/\s/.test(text[end])) end++;
    if (end > (cuts[cuts.length - 1] ?? 0)) cuts.push(end);
  }
  return cuts;
}

/** What Tex has written of its answer so far, as the backend sends it for a web chat turn: the whole text. */
function showDraft(state: DemoState, request: Message, text: string): void {
  emit(state, "message.draft", { conversationId: request.conversationId, turnId: `turn_${request.id}`, messageId: request.id, text, at: nowIso() });
}

/**
 * Tex writes `text` on screen, a few words at a time, from `fromMs` until just before `toMs` (when
 * the answer itself is posted, or Tex goes on to a tool). The last draft is the whole text.
 */
function writeDraft(state: DemoState, request: Message, text: string, fromMs: number, toMs: number): void {
  const cuts = draftCuts(text, Math.max(1, Math.floor((toMs - fromMs) / DRAFT_STEP_MS)));
  cuts.forEach((end, index) => schedule(state, fromMs + index * DRAFT_STEP_MS, () => showDraft(state, request, text.slice(0, end))));
}

/** Tex works through a question about the day, a tool at a time, writing its answer last (`DAY_TURN`). Returns when it answers. */
function workThroughDay(state: DemoState, request: Message): number {
  let at = PICKUP_MS + DRAFT_STEP_MS;
  for (const run of DAY_TURN.runs) {
    const [writeMs, stayMs] = run.text.length >= 80 ? LONG_LINE_MS : SHORT_LINE_MS;
    writeDraft(state, request, run.text, at, at + writeMs);
    const startOver = at + writeMs + stayMs;
    schedule(state, startOver, () => showDraft(state, request, ""));
    schedule(state, startOver + DRAFT_STEP_MS, () => emit(state, "agent.progress", { text: run.tool, crew: null, at: nowIso() }));
    at = startOver + TOOL_MS;
  }
  const answerAt = at + 1400 + 100;
  writeDraft(state, request, DAY_TURN.reply, at, answerAt - 100);
  return answerAt;
}

/** Tex works through the long turn (`ISSUES_TURN`): the apps, its line, Scout, the pages, then its answer. Returns when it answers. */
function workThroughIssues(state: DemoState, request: Message): number {
  const progress = (at: number, text: string, crew: SpecialistId | null = null) =>
    schedule(state, at, () => emit(state, "agent.progress", { text, crew, at: nowIso() }));
  let at = PICKUP_MS + DRAFT_STEP_MS;
  for (const look of ISSUES_TURN.apps) {
    progress(at, look);
    at += APP_LOOK_MS;
  }
  const [writeMs, stayMs] = LONG_LINE_MS;
  writeDraft(state, request, ISSUES_TURN.line, at, at + writeMs);
  // Scout sets to work while the line is on screen; Tex starts over when it reads the first page.
  progress(at + writeMs + 100, ISSUES_TURN.scout, "scout");
  at += writeMs + stayMs;
  schedule(state, at, () => showDraft(state, request, ""));
  for (const read of ISSUES_TURN.reads) progress((at += PAGE_MS), read);
  const answerAt = at + 1500;
  writeDraft(state, request, ISSUES_TURN.reply, at + DRAFT_STEP_MS, answerAt - 100);
  return answerAt;
}

/**
 * Tex's answer when an automation can't be made of a request from the New automation page: why, in
 * a sentence, and a request that would work (as the backend tells Tex to answer).
 */
export const CANT_DRAFT_REPLY =
  "That reads like something to do once, not something to run later, so it can’t be an automation.\nTry: “Every weekday at 9, sum up my unread email.”";

/**
 * A request from the New automation page (`purpose: automation_draft`): Tex only drafts it, or says
 * why it can't be one and suggests a request that would work. It never does the task itself.
 */
function answerDraftAsk(state: DemoState, request: Message): void {
  const proposed = proposeDraft(state, request);
  if (proposed) postFromTex(state, request.conversationId, proposed.line, null, proposed.draft.id, request.turnId ?? null);
  else postFromTex(state, request.conversationId, CANT_DRAFT_REPLY, null, null, request.turnId ?? null);
  chargeUsage(state, { awake: 1, ai: state.agentSettings.aiAccess === "platform" ? TEXTCREW_AI_CREDITS : 0 });
  setMessageStatus(state, request.id, "delivered");
  setAgentState(state, "awake");
}

function answer(state: DemoState, request: Message, job: CrewJob | null = null): void {
  setMessageStatus(state, request.id, "read");
  // "Remember that…" is a fact to keep, not a job: it comes first, so its words can't be taken for one.
  const fact = memoryRequestOf(request.text);
  // Something to do later is proposed as a draft, before anything in it can be read as a risky
  // action or a job for the crew ("every Monday, send me my open pull requests").
  const proposed = fact ? null : proposeDraft(state, request);
  const risk = fact || proposed ? null : riskOf(request.text);
  if (proposed) {
    postFromTex(state, request.conversationId, proposed.line, null, proposed.draft.id, request.turnId ?? null);
    chargeUsage(state, { awake: 1, ai: state.agentSettings.aiAccess === "platform" ? TEXTCREW_AI_CREDITS : 0 });
  } else if (fact) {
    postFromTex(state, request.conversationId, rememberFact(state, fact), null, null, request.turnId ?? null);
    chargeUsage(state, { awake: 1, ai: state.agentSettings.aiAccess === "platform" ? TEXTCREW_AI_CREDITS : 0 });
  } else if (risk) {
    askForApproval(state, request, risk);
  } else if (job) {
    postFromTex(state, request.conversationId, job.reply, null, null, request.turnId ?? null);
    if (job.crew === "scout") {
      // Scout's search is a paid tool: charged when it runs, on top of the time the agent ran.
      const charged = chargePaidTool(state, "Web search");
      logActivity(state, { actor: "agent", action: "web_search", summary: `Searched the web: ${truncate(request.text, 80)}`, creditsCharged: charged });
    }
    chargeUsage(state, { awake: 1, ai: state.agentSettings.aiAccess === "platform" ? TEXTCREW_AI_CREDITS : 0 });
  } else {
    postFromTex(state, request.conversationId, plannedReply(request, null) ?? plainReply(request.text), null, null, request.turnId ?? null);
    // The time Tex ran is charged, and the AI too when it ran on Textcrew AI. Nothing was changed in an app.
    chargeUsage(state, { awake: 1, ai: state.agentSettings.aiAccess === "platform" ? TEXTCREW_AI_CREDITS : 0 });
    logActivity(state, { actor: "agent", action: "run_app_action", summary: upperFirst(truncate(request.text, 70)), creditsCharged: 0 });
  }
  setAgentState(state, "awake");
}

/**
 * The web conversation a message is written in: the one named, made the active one first if it
 * wasn't, so Tex carries on with that conversation's own context; or the active one.
 */
function conversationToWriteIn(state: DemoState, conversationId: string | undefined): Conversation {
  if (conversationId === undefined) return activeWebConversation(state) ?? startWebConversation(state);
  const conversation = findConversation(state, conversationId);
  if (!conversation) throw notFound("That conversation doesn't exist");
  if (conversation.channel !== "web") throw conflict(`Reply on ${CHANNEL_LABEL[conversation.channel]} to continue this chat`);
  // The Automations chat stays where it is (makeActive leaves it): never the active one.
  makeActive(state, conversation);
  return conversation;
}

export const sendMessage: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const text = requiredString(body, "text", { min: 1, max: 8000 });
  const clientMessageId = requiredString(body, "clientMessageId");
  if (!UUID.test(clientMessageId)) throw badRequest("clientMessageId must be a UUID");
  const conversationId = stringField(body, "conversationId", { min: 1 });
  const purpose = body.purpose === undefined ? null : oneOf(body.purpose, ["automation_draft"] as const, "purpose");
  if (purpose && conversationId !== undefined) throw badRequest("Leave conversationId out: a request for an automation draft goes into the Automations chat");
  const attachments = readAttachments(state, body);

  // Sending the same id again returns the first message instead of making a second one.
  const sent = state.messages.find((message) => message.id === state.sentIds[clientMessageId]);
  if (sent) return json(sent, 202);

  if (!state.availableChannels.includes("web")) throw channelDisabled("web", "Web chat is switched off right now");
  if (balanceOf(state) <= 0) throw outOfCredits();
  // A request from the New automation page goes into the Automations chat (started if need be).
  const conversation = purpose ? automationsChat(state) : conversationToWriteIn(state, conversationId);

  const id = nextId(state, "msg");
  const message: Message = {
    id,
    conversationId: conversation.id,
    channel: "web",
    direction: "in",
    text,
    ...(attachments.length ? { attachments: attachments.map(({ id, name, mimeType }) => ({ id, name, mimeType })) } : {}),
    status: "queued",
    approvalId: null,
    // As the backend does: the web app matches its "sending" bubble to the saved message with it.
    clientMessageId,
    // The turn that answers it: Tex's answer carries the same id (`message.draft` uses it too).
    turnId: `turn_${id}`,
    createdAt: nowIso(),
  };
  state.messages.unshift(message);
  state.sentIds[clientMessageId] = message.id;
  emit(state, "message.created", message);
  messageSaved(state, message);

  // No AI to think with (Textcrew AI off, none of their own): as the backend does, the agent isn't
  // woken and one line says what to do.
  syncAgentSettings(state);
  if (state.agentSettings.aiAccess === "none") {
    schedule(state, ANSWER_MS, () => {
      setMessageStatus(state, message.id, "read");
      postFromTex(state, message.conversationId, `${NO_AI_REPLY} ${new URL(request.url).origin}/settings/ai`, null, null, message.turnId ?? null);
    });
    return json(message, 202);
  }

  schedule(state, PICKUP_MS, () => {
    setAgentState(state, "busy");
    setMessageStatus(state, message.id, "processing");
  });
  if (purpose) {
    schedule(state, ANSWER_MS, () => answerDraftAsk(state, message));
    return json(message, 202);
  }
  // A job for a specialist takes longer, and says what it is doing on the way.
  const later = !memoryRequestOf(text) && proposalOf(text) !== null;
  const job = later || memoryRequestOf(text) || riskOf(text) ? null : crewJobOf(state, text);
  // Tex's answer is written on screen as it is written, as in web chat for real. A draft is posted
  // whole, with its card.
  const reply = later ? null : plannedReply(message, job);
  if (job) {
    // Tex says who it hands the job to, then starts over when the specialist sets to work.
    writeDraft(state, message, `I’ll hand this to ${job.name}.`, PICKUP_MS + DRAFT_STEP_MS, PICKUP_MS + 8 * DRAFT_STEP_MS);
    schedule(state, CREW_STEP_MS - 1, () => showDraft(state, message, ""));
    job.steps.forEach((step, index) => schedule(state, CREW_STEP_MS * (index + 1), () => reportProgress(state, job, step)));
    const answerAt = CREW_STEP_MS * job.steps.length + FOLLOW_UP_MS;
    if (reply) writeDraft(state, message, reply, CREW_STEP_MS * job.steps.length + DRAFT_STEP_MS, answerAt);
    schedule(state, answerAt, () => answer(state, message, job));
  } else if (reply === DAY_TURN.reply) {
    const answerAt = workThroughDay(state, message);
    schedule(state, answerAt, () => answer(state, message));
  } else if (reply === ISSUES_TURN.reply) {
    const answerAt = workThroughIssues(state, message);
    schedule(state, answerAt, () => answer(state, message));
  } else {
    if (reply) writeDraft(state, message, reply, PICKUP_MS + DRAFT_STEP_MS, ANSWER_MS);
    schedule(state, ANSWER_MS, () => answer(state, message));
  }
  return json(message, 202);
};

export const uploadAttachment: Handler = async ({ state, request }) => {
  const tooLarge = new HttpError(413, "invalid_request", "File too large (max 10 MB)");
  // A little slack for the multipart framing around the file.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) throw tooLarge;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Send the file as multipart/form-data");
  }
  const file = form.get("file");
  if (file === null || typeof file === "string") throw badRequest("file is required");
  if (file.size > MAX_UPLOAD_BYTES) throw tooLarge;

  const attachment: Attachment = {
    id: nextId(state, "att"),
    name: file.name || "file",
    sizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
  };
  state.attachments[attachment.id] = attachment;
  return json(attachment, 201);
};

/** How long after the app first connects the demo's weekday automation runs once more, so a run can be seen arriving. */
export const DEMO_RUN_MS = 20_000;

/**
 * "Today's meetings" runs once more, as an automation does: its answer goes to the Automations
 * chat (started again if it was deleted), never to the chat that is open.
 */
export function runDemoAutomation(state: DemoState): void {
  const automation = state.automations.find((item) => item.id === "aut_meetings" && item.enabled);
  if (!automation) return;
  const chat = automationsChat(state);
  postFromTex(state, chat.id, "A change to today’s meetings: “Roadmap sync” moved to tomorrow at 3pm, so you’re free from 2 until the dentist at 5:30.");
  automation.lastRunAt = nowIso();
  emit(state, "automation.updated", automation);
}

export const openStream: Handler = ({ request, state }) => {
  // Once per demo account, a little after the app first connects.
  if (!state.demoRunScheduled) {
    state.demoRunScheduled = true;
    schedule(state, DEMO_RUN_MS, () => runDemoAutomation(state));
  }
  return streamResponse(request, state);
};

// ---------------------------------------------------------------- approvals

/** Pending approvals whose time has run out become expired; Tex does nothing for them. */
export function expireApprovals(state: DemoState): void {
  const now = Date.now();
  for (const approval of state.approvals) {
    if (approval.status === "pending" && Date.parse(approval.expiresAt) <= now) {
      approval.status = "expired";
      emit(state, "approval.resolved", approval);
    }
  }
}

export const listApprovals: Handler = ({ state, url }) => {
  const raw = url.searchParams.get("status");
  const status = raw === null ? "pending" : oneOf(raw, APPROVAL_STATUSES, "status");
  return json(paginate(state.approvals.filter((approval) => approval.status === status), url));
};

function followUp(state: DemoState, approval: Approval): void {
  const replies = state.approvalReplies[approval.id] ?? { approved: "Done. That’s taken care of.", rejected: "Okay, I won’t do that." };
  // Answer in the conversation the ask is in; if that was deleted, where its chat writes now.
  const ask = state.messages.find((message) => message.approvalId === approval.id);
  const conversation = findConversation(state, ask?.conversationId) ?? activeConversation(state, ask?.channel ?? "web") ?? startWebConversation(state);
  if (approval.status === "approved") {
    postFromTex(state, conversation.id, replies.approved);
    const charged = chargeAppAction(state, approval.action ?? "APP_ACTION");
    logActivity(state, { actor: "agent", action: "run_app_action", summary: approval.summary, creditsCharged: charged });
  } else {
    postFromTex(state, conversation.id, replies.rejected);
  }
}

export const decideApproval: Handler = async ({ state, request, params }) => {
  const body = await readJson(request);
  const decision = oneOf(body.decision, ["approve", "reject"] as const, "decision");
  const approval = state.approvals.find((item) => item.id === params.approvalId);
  if (!approval) throw notFound("That approval doesn't exist");
  if (approval.status !== "pending") {
    throw conflict(approval.status === "expired" ? "This approval has expired" : "This approval was already decided");
  }

  approval.status = decision === "approve" ? "approved" : "rejected";
  approval.decidedAt = nowIso();
  // Answered: no "Don't ask again" any more (the backend offers it only while it waits).
  approval.skip = null;
  emit(state, "approval.resolved", approval);
  logActivity(state, {
    actor: "user",
    action: "approval_decided",
    summary: `${decision === "approve" ? "Approved" : "Denied"} “${approval.summary}”`,
  });
  schedule(state, FOLLOW_UP_MS, () => followUp(state, approval));
  return json(approval);
};

// ---------------------------------------------------------------- skip rules ("Don't ask again")

const notSkippable = (message: string) => new HttpError(400, "not_skippable", message);

const ruleLine = (rule: SkipRule) => {
  const scope = ruleScopeLine(rule);
  return `${titleCase(rule.app)}: ${rule.actionName.toLowerCase()} ${scope.charAt(0).toLowerCase()}${scope.slice(1)}`;
};

export const listSkipRules: Handler = ({ state }) => json({ items: state.skipRules });

/** As the backend: a rule from one of the user's approvals, with a choice its card offered; the same one again is returned. */
export const createSkipRule: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const approvalId = requiredString(body, "approvalId");
  const scope = oneOf(body.scope, SKIP_SCOPES, "scope");
  const approval = state.approvals.find((item) => item.id === approvalId);
  if (!approval) throw notFound("Approval not found");
  // The card saves the rule before its yes, so the offer is the waiting card's own.
  const offer = approval.skip ?? skipOfferOfApproval(approval);
  if (!offer || !approval.app || !approval.action)
    throw notSkippable("This action always asks first: deleting, paying, merging and Tex’s own commands and pushes can’t be skipped.");
  if (!offer.scopes.includes(scope)) throw notSkippable(`For this action the choice is: ${offer.scopes.join(" or ")}.`);
  const given = Array.isArray(body.recipients) ? body.recipients.filter((item): item is string => typeof item === "string") : offer.recipients;
  const recipients = scope === "listed" ? [...new Set(given.map((item) => item.trim().toLowerCase()).filter(Boolean))] : [];
  if (scope === "listed" && recipients.length === 0) throw badRequest("Name at least one recipient");

  const existing = state.skipRules.find((rule) => rule.action === approval.action && rule.scope === scope);
  if (existing) {
    const merged = [...new Set([...existing.recipients, ...recipients])];
    if (merged.length > MAX_SKIP_RECIPIENTS) throw badRequest(`A rule holds at most ${MAX_SKIP_RECIPIENTS} recipients`);
    existing.recipients = merged;
    return json(existing, 201);
  }
  if (state.skipRules.length >= MAX_SKIP_RULES)
    throw new HttpError(409, "too_many_rules", `You have ${MAX_SKIP_RULES} skip rules already. Remove one first.`);
  const rule: SkipRule = {
    id: nextId(state, "skp"),
    app: approval.app,
    action: approval.action,
    actionName: offer.actionName,
    scope,
    recipients,
    createdAt: nowIso(),
  };
  state.skipRules.unshift(rule);
  logActivity(state, { actor: "user", action: "skip_rule_created", summary: `Don't ask again: ${ruleLine(rule)}` });
  return json(rule, 201);
};

/** The offer for an approval no longer waiting, worked out again from its action. Never for Tex's own kinds. */
function skipOfferOfApproval(approval: Approval): SkipOffer | null {
  return approval.kind === "app_action" && approval.app && approval.action ? skipOfferOf({ app: approval.app, action: approval.action, reason: "" }) : null;
}

export const deleteSkipRule: Handler = ({ state, params }) => {
  const index = state.skipRules.findIndex((rule) => rule.id === params.ruleId);
  if (index < 0) throw notFound("Skip rule not found");
  const [rule] = state.skipRules.splice(index, 1);
  logActivity(state, { actor: "user", action: "skip_rule_removed", summary: `Asks again from now on: ${ruleLine(rule)}` });
  return noContent();
};
