// Chat, attachments and approvals for the demo account, including Tex's delayed answers.

import type { Approval, ApprovalStatus, Attachment, ChannelType, Message } from "@/lib/api/client";
import { lowerFirst, nowIso, truncate, upperFirst, type Handler } from "./context";
import {
  badRequest,
  conflict,
  HttpError,
  json,
  notFound,
  oneOf,
  outOfCredits,
  paginate,
  readJson,
  requiredString,
  type JsonObject,
} from "./http";
import { balanceOf, charge, emit, logActivity, nextId, schedule, setAgentState, type DemoState } from "./store";
import { streamResponse } from "./stream";

const CHANNELS: readonly ChannelType[] = ["whatsapp", "telegram", "imessage", "web"];
const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "rejected", "expired"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTACHMENTS = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DAY_MS = 86_400_000;

// How long Tex "thinks" before each step.
const PICKUP_MS = 300;
const ANSWER_MS = 1500;
const FOLLOW_UP_MS = 900;

// ---------------------------------------------------------------- messages

export const listMessages: Handler = ({ state, url }) => {
  const raw = url.searchParams.get("channel");
  const channel = raw === null ? null : oneOf(raw, CHANNELS, "channel");
  const items = channel ? state.messages.filter((message) => message.channel === channel) : state.messages;
  return json(paginate(items, url));
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

function postFromTex(state: DemoState, channel: ChannelType, text: string, approvalId: string | null = null): Message {
  const message: Message = {
    id: nextId(state, "msg"),
    channel,
    direction: "out",
    text,
    status: "sent",
    approvalId,
    createdAt: nowIso(),
  };
  state.messages.unshift(message);
  emit(state, "message.created", message);
  return message;
}

type Risk = { app: string; action: string; reason: string };

/** Requests that touch other people, delete things or post in public wait for an OK, as in the product. */
function riskOf(text: string): Risk | null {
  if (/\bdelete\b/i.test(text)) return { app: "gmail", action: "GMAIL_DELETE", reason: "Deletes things" };
  if (/\bpost\b/i.test(text)) return { app: "slack", action: "SLACK_SEND_MESSAGE", reason: "Posts where others see it" };
  if (/\b(e-?mail|send)\b/i.test(text)) return { app: "gmail", action: "GMAIL_SEND_EMAIL", reason: "Sends to someone else" };
  return null;
}

function askForApproval(state: DemoState, request: Message, risk: Risk): void {
  const createdAt = nowIso();
  const approval: Approval = {
    id: nextId(state, "ap"),
    status: "pending",
    summary: upperFirst(truncate(request.text, 70)),
    app: risk.app,
    action: risk.action,
    details: { arguments: { body: request.text } },
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + DAY_MS).toISOString(),
    decidedAt: null,
  };
  state.approvals.unshift(approval);
  emit(state, "approval.created", approval);
  logActivity(state, { actor: "agent", action: "approval_requested", summary: `Asked to ${lowerFirst(approval.summary)}` });
  // As the backend does it: the ask is its own message carrying the approval, then Tex's words.
  postFromTex(state, request.channel, `Approval needed: ${approval.summary}`, approval.id);
  postFromTex(state, request.channel, "That one needs your OK before I do it.");
}

function answer(state: DemoState, request: Message): void {
  setMessageStatus(state, request.id, "read");
  const risk = riskOf(request.text);
  if (risk) {
    askForApproval(state, request, risk);
  } else {
    const quote = truncate(request.text, 80);
    postFromTex(state, request.channel, `Got it. In the demo account nothing is really done, but this is where I’d tell you how “${quote}” went.`);
    const cost = 1 + (request.text.length % 3);
    const charged = charge(state, cost, `Task: ${lowerFirst(truncate(request.text, 60))}`, cost === 3 ? 1 : 0);
    logActivity(state, { actor: "agent", action: "app_action", summary: upperFirst(truncate(request.text, 70)), creditsCharged: charged });
  }
  setAgentState(state, "awake");
}

export const sendMessage: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const text = requiredString(body, "text", { min: 1, max: 8000 });
  const clientMessageId = requiredString(body, "clientMessageId");
  if (!UUID.test(clientMessageId)) throw badRequest("clientMessageId must be a UUID");
  const attachments = readAttachments(state, body);

  // Sending the same id again returns the first message instead of making a second one.
  const sent = state.messages.find((message) => message.id === state.sentIds[clientMessageId]);
  if (sent) return json(sent, 202);

  if (balanceOf(state) <= 0) throw outOfCredits();

  const message: Message = {
    id: nextId(state, "msg"),
    channel: "web",
    direction: "in",
    text,
    ...(attachments.length ? { attachments: attachments.map(({ id, name, mimeType }) => ({ id, name, mimeType })) } : {}),
    status: "queued",
    approvalId: null,
    createdAt: nowIso(),
  };
  state.messages.unshift(message);
  state.sentIds[clientMessageId] = message.id;
  emit(state, "message.created", message);

  schedule(state, PICKUP_MS, () => {
    setAgentState(state, "busy");
    setMessageStatus(state, message.id, "processing");
  });
  schedule(state, ANSWER_MS, () => answer(state, message));
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

export const openStream: Handler = ({ request, state }) => streamResponse(request, state);

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
  // Answer in the chat the request came from.
  const channel = state.messages.find((message) => message.approvalId === approval.id)?.channel ?? "web";
  if (approval.status === "approved") {
    postFromTex(state, channel, replies.approved);
    const charged = charge(state, 1, `Task: ${lowerFirst(approval.summary)}`);
    logActivity(state, { actor: "agent", action: "app_action", summary: approval.summary, creditsCharged: charged });
  } else {
    postFromTex(state, channel, replies.rejected);
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
  emit(state, "approval.resolved", approval);
  logActivity(state, {
    actor: "user",
    action: "approval_decided",
    summary: `${decision === "approve" ? "Approved" : "Rejected"} “${approval.summary}”`,
  });
  schedule(state, FOLLOW_UP_MS, () => followUp(state, approval));
  return json(approval);
};
