// How a line of the credit history reads. The backend writes three kinds of charge:
// "Usage: AI 3, awake time 1, browser 2" (the AI, the time the agent ran, minutes in the browser),
// "App action: GMAIL_SEND_EMAIL" (one credit for an action that changed something)
// and a paid tool under its own name, such as "Web search" (one line per use).

import type { LedgerEntry } from "@/lib/api/client";
import { humanizeEvent, titleCase } from "@/lib/format";

const REASON_LABEL: Record<LedgerEntry["reason"], string> = {
  grant: "added",
  charge: "used",
  expire: "expired",
  refund: "refund",
  adjust: "adjusted",
  reversal: "reversed",
};

// The ledger has no field for the kind of charge, so a paid tool is known by the name the backend gives it.
const PAID_TOOLS: ReadonlySet<string> = new Set(["Web search"]);

const APP_ACTION = /^App action:\s*([A-Za-z0-9_]+)$/;
const USAGE = /^Usage:\s*(.*)$/;

/** "GMAIL_SEND_EMAIL" → "Gmail: send email" */
function describeAction(name: string): string {
  const [app, ...rest] = name.split("_").filter(Boolean);
  if (!app) return "App action";
  const what = humanizeEvent(rest.join("_"));
  return what ? `${titleCase(app.toLowerCase())}: ${what}` : titleCase(app.toLowerCase());
}

const USAGE_PART: Record<string, string> = { AI: "Textcrew AI", "awake time": "running time", browser: "browser use" };

/**
 * "AI 3, awake time 1, browser 2" → "Textcrew AI 3, running time 1, browser use 2": the words the
 * rest of the app uses. A charge for one thing only needs its name; the amount is in its own column.
 */
function describeUsage(parts: string): string {
  if (!parts || parts === "none") return "Usage";
  const named = parts.split(/,\s*/).map((part) => {
    const match = /^(.*?)\s+(\d+)$/.exec(part);
    const name = match ? match[1] : part;
    return { name: USAGE_PART[name] ?? name, amount: match ? match[2] : null };
  });
  const words = named.length === 1 ? named[0].name : named.map((part) => (part.amount ? `${part.name} ${part.amount}` : part.name)).join(", ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What a history line shows under "What" and "Reason". */
export function describeLedgerEntry(entry: Pick<LedgerEntry, "description" | "reason">): { what: string; reason: string } {
  const description = entry.description?.trim() ?? "";
  if (entry.reason === "charge" || entry.reason === "reversal") {
    const action = APP_ACTION.exec(description);
    if (action) return { what: describeAction(action[1]), reason: entry.reason === "charge" ? "app action" : REASON_LABEL.reversal };
    const usage = USAGE.exec(description);
    if (usage) return { what: describeUsage(usage[1]), reason: REASON_LABEL[entry.reason] };
    if (PAID_TOOLS.has(description)) return { what: description, reason: entry.reason === "charge" ? "paid tool" : REASON_LABEL.reversal };
  }
  return { what: description || "Credits", reason: REASON_LABEL[entry.reason] };
}
