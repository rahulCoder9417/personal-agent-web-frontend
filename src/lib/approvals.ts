// Why Tex is asking, worked out from the action name (e.g. GMAIL_SEND_EMAIL), and what an
// answered approval says.

import type { Approval, ApprovalStatus } from "./api/client";

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

/**
 * What one of the agent's own actions asks for, read from the approval's `kind` and `details`: one of Claude
 * Code's commands or file changes, a git push to a branch that already existed, or running a crew job again with
 * what its run was refused. Null for an app's action (its details are shown as fields).
 */
export type OwnAction =
  | { kind: "command"; tool: string; target: string; why: string | null; folder: string | null }
  | { kind: "git_push"; repo: string; branch: string; force: boolean }
  | { kind: "crew_rerun"; job: string | null; items: string[] };

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function ownAction(approval: Pick<Approval, "kind" | "details">): OwnAction | null {
  const d = approval.details ?? {};
  if (approval.kind === "command") {
    const target = text(d.target);
    if (!target) return null;
    return { kind: "command", tool: text(d.tool) ?? "Bash", target, why: text(d.why), folder: text(d.folder) };
  }
  if (approval.kind === "git_push") {
    const repo = text(d.repo);
    const branch = text(d.branch);
    if (!repo || !branch) return null;
    return { kind: "git_push", repo, branch, force: d.force === true };
  }
  if (approval.kind === "crew_rerun") {
    const items = Array.isArray(d.items) ? d.items.filter((item): item is string => typeof item === "string") : [];
    return { kind: "crew_rerun", job: text(d.job), items };
  }
  return null;
}

/** Why Tex is asking, for any approval: the agent's own actions by what they do, an app's by its action name. */
export function approvalReasonOf(approval: Pick<Approval, "kind" | "details" | "action">): ApprovalReason {
  const own = ownAction(approval);
  if (own?.kind === "command") return { label: own.tool === "Bash" ? "Runs a command" : "Changes a file", tone: "info" };
  if (own?.kind === "git_push") return own.force ? { label: "Rewrites a branch", tone: "danger" } : { label: "Pushes code", tone: "info" };
  if (own?.kind === "crew_rerun") return { label: "Runs the job again", tone: "neutral" };
  return approvalReason(approval.action);
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

/**
 * The line in Tex's bubble above the card on the web. The backend's wording ("I'd like to <summary>. Approve or
 * Deny below.") is what Telegram and WhatsApp get, and it often holds a long raw command or link; the card right
 * under it already says what and why. Rule: a message ending in the "Approve or Deny below." tail becomes one fixed
 * short line; any other message is kept only if it is already short (under 80 characters), else the same line.
 * Older "Approval needed: ..." asks still give null (the card shows alone).
 */
export const APPROVAL_LINE = "I need your OK for this.";
export function webApprovalLine(text: string): string | null {
  const question = approvalQuestion(text);
  if (!question) return null;
  if (/approve or deny below\.?$/i.test(question) || question.length >= 80) return APPROVAL_LINE;
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
