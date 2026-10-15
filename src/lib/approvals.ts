// Why Tex is asking, worked out from the action name (e.g. GMAIL_SEND_EMAIL), and what an
// answered approval says.

import type { ApprovalStatus } from "./api/client";

export type ApprovalReason = {
  label: string;
  /** "info" reads in the accent colour; "danger" marks deleting and spending. */
  tone: "info" | "danger" | "neutral";
};

const MONEY = ["PAY", "PURCHASE", "RENEW", "CHARGE", "BUY"];
const DELETES = ["DELETE", "REMOVE", "TRASH"];
const SENDS = ["SEND", "POST", "REPLY", "SHARE", "INVITE"];

/** GMAIL_SEND_EMAIL / gmailSendEmail / "gmail send-email" → ["GMAIL", "SEND", "EMAIL"] */
function words(action: string): string[] {
  return action
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

export function approvalReason(action?: string | null): ApprovalReason {
  const tokens = words(action ?? "");
  const has = (list: string[]) => tokens.some((token) => list.includes(token));
  // Spending and deleting outrank sending: "SEND_PAYMENT" is about the money.
  if (has(MONEY) || tokens.includes("PAYMENT")) return { label: "Costs money", tone: "danger" };
  if (has(DELETES)) return { label: "Deletes things", tone: "danger" };
  if (has(SENDS)) return { label: "Sends to someone else", tone: "info" };
  return { label: "Needs your OK", tone: "neutral" };
}

export type DetailField = { key: string; label: string; value: string };

const PREVIEW_KEYS = ["body", "text", "message"];

function fieldLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" || typeof v === "number")) {
    return value.join(", ");
  }
  return null;
}

/**
 * Splits an approval's free-form `details` into the quoted preview (the email body, the post text)
 * and the short fields around it (to, from, subject…). Nested objects are left out.
 */
export function splitDetails(raw?: Record<string, unknown>): { preview: string | null; fields: DetailField[] } {
  if (!raw) return { preview: null, fields: [] };
  // The backend files what the action will be called with under `arguments`; those are the details people care about.
  const { arguments: args, ...rest } = raw;
  const details: Record<string, unknown> = args && typeof args === "object" && !Array.isArray(args) ? { ...(args as Record<string, unknown>), ...rest } : raw;
  const previewKey = PREVIEW_KEYS.find((key) => typeof details[key] === "string" && (details[key] as string).trim());
  const fields: DetailField[] = [];
  for (const [key, entry] of Object.entries(details)) {
    if (key === previewKey) continue;
    const value = fieldValue(entry);
    if (value !== null) fields.push({ key, label: fieldLabel(key), value });
  }
  return { preview: previewKey ? (details[previewKey] as string) : null, fields };
}

/**
 * Tex's words above an approval card: the message that carries the approval, in which Tex says what
 * it wants to do and that it waits for Approve or Deny ("I'd like to send an email to … Approve or
 * Deny below."). The backend's older asks ("Approval needed: …") only repeat the card's summary, so
 * they give null: the card shows alone.
 */
export function approvalQuestion(text: string): string | null {
  const question = text.trim();
  if (!question || /^approval needed:/i.test(question)) return null;
  return question;
}

export type SettledStatus = Exclude<ApprovalStatus, "pending">;

/**
 * The line under an answered approval in the chat. `replaced` is not the user's no: Tex asked
 * again with corrected details, and the newer request below is the one to answer.
 */
export const APPROVAL_RESULT: Record<SettledStatus, { text: string; tone: "success" | "danger" | "muted"; icon: "check" | "close" | null }> = {
  approved: { text: "You approved this", tone: "success", icon: "check" },
  rejected: { text: "You denied this", tone: "danger", icon: "close" },
  expired: { text: "This expired before it was answered", tone: "muted", icon: "close" },
  replaced: { text: "Replaced by a newer request", tone: "muted", icon: null },
};

/** What came of an answered approval, on the Approvals screen. */
export function approvalOutcome(status: SettledStatus): string {
  // A yes tells Tex to go ahead; whether the app then did it shows in the chat and the activity log.
  if (status === "approved") return "Tex was told to go ahead.";
  if (status === "rejected") return "Tex didn’t do this.";
  if (status === "replaced") return "Tex asked again with corrected details, so this request was set aside. Nothing was done with it.";
  return "Nothing was done. Ask Tex again if you still want it.";
}
