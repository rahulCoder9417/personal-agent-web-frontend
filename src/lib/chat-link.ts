// Links into the chat from other screens.

/**
 * The chat with a request already typed in, ready to send or to change first. The composer reads
 * `?draft=` once and tidies the address, so the link is the whole hand-over: nothing is sent
 * until the person presses Send.
 */
export function chatDraftHref(text: string): string {
  return `/?draft=${encodeURIComponent(text.trim())}`;
}
