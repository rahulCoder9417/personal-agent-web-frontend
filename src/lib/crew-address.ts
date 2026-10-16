// Where the crew is explained, and the address the Crew screen had.
// No imports at run time: next.config.ts reads the redirect from here when the app is built, as it
// reads src/lib/integrations.ts.

/** The crew's part of Help: who is on it, what each one does, and how to ask Byte and Patch in the chat. */
export const CREW_HELP_PATH = "/help#crew";

/**
 * There is no Crew screen any more: Byte and Patch are asked for in the chat, and what the crew is
 * lives in Help. Bookmarks and old links to `/crew` lead to Help's crew section. Temporary (307),
 * so a browser doesn't keep it for good.
 */
export const OLD_CREW_ADDRESSES = [{ source: "/crew", destination: CREW_HELP_PATH, permanent: false }] as const;
