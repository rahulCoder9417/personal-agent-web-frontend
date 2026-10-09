// What Tex writes in the web chat may be Markdown (CommonMark, plus tables, task lists and
// strikethrough). These are the rules the chat goes by when it draws a reply; the drawing itself is
// in src/components/chat/markdown.tsx.

/**
 * Anything Markdown would draw as something other than the words as typed. One line per kind:
 * emphasis, code, strikethrough, links, quotes, tables, escapes and raw HTML (drawn as text, but by
 * the renderer); a heading; a list item; a numbered item; a rule or the line under a heading; an
 * address or an email, which become links; a character written as an entity.
 */
const MARKS = new RegExp(
  [
    "[*_`~\\[\\]<>|\\\\]",
    "^[ \\t]*#{1,6}(?:[ \\t]|$)",
    "^[ \\t]*[-+][ \\t]",
    "^[ \\t]*\\d{1,9}[.)](?:[ \\t]|$)",
    "^[ \\t]*(?:-+|=+)[ \\t]*$",
    "https?://|www\\.|\\S@\\S",
    "&(?:#\\w+|[a-zA-Z]\\w*);",
  ].join("|"),
  "m",
);

/**
 * Whether a reply has anything in it for Markdown to draw. One that hasn't (most short replies, and
 * what Tex writes for a chat app such as Telegram) is shown exactly as typed, and the renderer is
 * not loaded for it.
 *
 * It leans towards yes: a yes for plain words costs only the loading, and they are drawn the same.
 * A no for Markdown would leave its symbols on screen.
 */
export function hasMarkdown(text: string): boolean {
  return MARKS.test(text);
}

const LINK = /^(?:https?:\/\/|mailto:)/i;
const LINK_PROTOCOLS = ["http:", "https:", "mailto:"];

/**
 * Where a link in a reply may lead: a web page (http or https) or an email address (mailto), given
 * in full. Returns the address, or null for anything else (`javascript:`, `data:`, a path inside
 * this app, an address without its scheme), which is then shown as words and not as a link.
 */
export function safeLink(url: string | null | undefined): string | null {
  const address = (url ?? "").trim();
  if (!LINK.test(address)) return null;
  try {
    return LINK_PROTOCOLS.includes(new URL(address).protocol) ? address : null;
  } catch {
    return null;
  }
}

const LANGUAGE = /^language-([\w#+.-]{1,24})$/;

/**
 * The language a code block was given, from the class names it arrives with: ["language-ts"] is
 * "ts". Null when the block names none, or names something that isn't a short word.
 */
export function codeLanguage(classNames: unknown): string | null {
  const names = Array.isArray(classNames) ? classNames : typeof classNames === "string" ? classNames.split(/\s+/) : [];
  for (const name of names) {
    const match = LANGUAGE.exec(String(name));
    if (match) return match[1];
  }
  return null;
}
