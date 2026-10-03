// What credits pay for, written once so every screen says the same thing.
// The prices are the launch plan's (decision D6); the backend does the charging.

export type CreditCost = { id: "ai" | "time" | "actions" | "browser"; name: string; detail: string };

export const CREDIT_COSTS: readonly CreditCost[] = [
  { id: "ai", name: "Textcrew AI", detail: "only if you use it. With your own AI, the AI part isn’t charged." },
  { id: "time", name: "Your agent’s running time", detail: "1 credit per 10 minutes." },
  {
    id: "actions",
    name: "Actions in your apps",
    detail: "1 credit per action that changes something, such as sending an email or creating an event. Reading and searching are free.",
  },
  { id: "browser", name: "Browser use", detail: "2 credits per minute of browser time. Max plan only." },
];

/** The same thing in one sentence, for places with no room for a list. */
export const CREDITS_PAY_FOR =
  "Credits pay for Textcrew AI if you use it, your agent’s running time (1 credit per 10 minutes), actions in your apps (1 credit per action that changes something; reading and searching are free) and, on the Max plan, browser use (2 credits per minute). With your own AI, the AI part isn’t charged.";

/** What the usage numbers are made of, for the line under the chart. */
export const USAGE_RATES =
  "Running time is 1 credit per 10 minutes. An app action that changes something is 1 credit; reading and searching are free. Browser use, on the Max plan, is 2 credits per minute.";
