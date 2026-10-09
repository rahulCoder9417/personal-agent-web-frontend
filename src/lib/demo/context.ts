import type { DemoState } from "./store";

export type Context = {
  request: Request;
  url: URL;
  /** Values of the `:name` parts of the matched path. */
  params: Record<string, string>;
  state: DemoState;
};

export type Handler = (context: Context) => Response | Promise<Response>;

export const nowIso = () => new Date().toISOString();

/** "send maya the notes" → "Send maya the notes" */
export const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Send this email" → "send this email" */
export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** What a conversation is called until someone says something in it. */
export const NEW_CHAT_TITLE = "New chat";
const TITLE_LENGTH = 60;

/**
 * A conversation's title, as the backend makes it: the first incoming message's text, cut to 60
 * characters at a word.
 */
export function conversationTitle(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= TITLE_LENGTH) return flat || NEW_CHAT_TITLE;
  const head = flat.slice(0, TITLE_LENGTH);
  const lastSpace = head.lastIndexOf(" ");
  // One very long word has no place to cut at; it is cut where the room ends.
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[\s,;:.!?-]+$/, "")}…`;
}
