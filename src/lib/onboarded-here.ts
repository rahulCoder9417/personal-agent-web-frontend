// This browser's note that the signed-in account has finished or skipped the welcome flow, so the
// chat can show at once on the next visit instead of waiting for `GET /v1/me` first. One note per
// account (`tc:onboarded:<Clerk user id>`), so someone else signing in here doesn't get it. It is
// only a hint: the account decides, and a note it contradicts (the tour shown again, an admin
// reset) is dropped. Every read and write is guarded: private windows and blocked storage throw.

import type { AuthMode } from "./auth-mode";

export const ONBOARDED_PREFIX = "tc:onboarded:";

/**
 * The Clerk user id in the session cookie Clerk keeps for this site (`__session`, a JWT; its
 * `sub`), or null. Not verified: it only picks which note to read, and the backend checks every
 * request itself.
 */
export function clerkUserIdFromCookies(cookies: string): string | null {
  for (const part of cookies.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== "__session") continue;
    try {
      const payload = decodeURIComponent(part.slice(eq + 1).trim()).split(".")[1];
      if (!payload) return null;
      const claims: unknown = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      const sub = (claims as { sub?: unknown } | null)?.sub;
      return typeof sub === "string" && sub !== "" ? sub : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Whose note to read: the Clerk user where there is sign-in, the one account in demo or dev-token mode. */
export function accountHere(mode: AuthMode, cookies: string): string | null {
  return mode === "clerk" ? clerkUserIdFromCookies(cookies) : mode;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const onboardedHere = {
  has(account: string | null, store: Store | null = browserStore()): boolean {
    if (!account || !store) return false;
    try {
      return store.getItem(ONBOARDED_PREFIX + account) === "1";
    } catch {
      return false;
    }
  },
  /** Notes that the account has finished or skipped the flow (`done`), or drops the note. */
  set(account: string | null, done: boolean, store: Store | null = browserStore()): void {
    if (!account || !store) return;
    try {
      if (done) store.setItem(ONBOARDED_PREFIX + account, "1");
      else store.removeItem(ONBOARDED_PREFIX + account);
    } catch {
      // Storage refused: the chat waits for the account next time, as for a new browser.
    }
  },
  /** Every account's notes (this one and `openedChatHere`), on signing out or deleting the account. */
  forgetAll(store: Store | null = browserStore()): void {
    showCoverHint(false);
    if (!store) return;
    try {
      const keys: string[] = [];
      for (let index = 0; index < store.length; index++) {
        const key = store.key(index);
        if (key?.startsWith(ONBOARDED_PREFIX) || key?.startsWith(OPENED_CHAT_PREFIX)) keys.push(key);
      }
      for (const key of keys) store.removeItem(key);
    } catch {
      // Nothing to do: a note left behind is only a hint, and only for its own account.
    }
  },
};

/**
 * This browser's note of the conversation the chat opened by itself last time (the active web
 * chat), one per account, so the next visit asks for its messages beside the list of chats instead
 * of after it: one wait for the database less before the chat shows, about 0.3 seconds. Only an id,
 * never what was said. A note gone stale (a new chat started elsewhere) costs one request nobody
 * waits for: the chat opens what the list says, as before.
 */
export const OPENED_CHAT_PREFIX = "tc:opened-chat:";

export const openedChatHere = {
  get(account: string | null, store: Store | null = browserStore()): string | null {
    if (!account || !store) return null;
    try {
      return store.getItem(OPENED_CHAT_PREFIX + account) || null;
    } catch {
      return null;
    }
  },
  set(account: string | null, conversationId: string, store: Store | null = browserStore()): void {
    if (!account || !store) return;
    try {
      if (store.getItem(OPENED_CHAT_PREFIX + account) !== conversationId) store.setItem(OPENED_CHAT_PREFIX + account, conversationId);
    } catch {
      // Storage refused: the next visit asks for the list first, as before.
    }
  },
};

/** The signed-in account here, as the notes are kept by (null outside a browser, or when it can't be read). */
export function currentAccount(mode: AuthMode): string | null {
  try {
    return accountHere(mode, document.cookie);
  } catch {
    return null;
  }
}

/** Whether this browser has the note for the signed-in account. Only in a browser; false anywhere else. */
export function isOnboardedHere(mode: AuthMode): boolean {
  return onboardedHere.has(currentAccount(mode));
}

/** Calls back when another tab changes the notes. */
export function subscribeOnboardedHere(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Brings the note in line with the account's `onboardingCompletedAt` (undefined: a backend that doesn't say). */
export function rememberOnboarded(mode: AuthMode, completedAt: string | null | undefined): void {
  if (completedAt === undefined) return;
  onboardedHere.set(currentAccount(mode), completedAt !== null);
  // The account said the flow isn't done: the cover over the chat must show from here on.
  if (completedAt === null) showCoverHint(false);
}

// ---------------------------------------------------------------- before the first paint

/**
 * Set on <html> before the first paint when this browser has the note for the signed-in account.
 * The chat's page is built ahead with its cover on (src/components/onboarding/welcome-gate.tsx),
 * and React can only read the note once it has started, so without this the cover would show for
 * that moment on every visit. `html[data-onboarded] .welcome-cover` hides it (globals.css).
 */
export const COVER_HINT_ATTRIBUTE = "data-onboarded";

function showCoverHint(onboarded: boolean): void {
  try {
    document.documentElement.toggleAttribute(COVER_HINT_ATTRIBUTE, onboarded);
  } catch {
    // No page (drawn ahead, or a test).
  }
}

/**
 * The script that sets the hint, written into the page ahead of the app (src/app/(app)/layout.tsx)
 * so it runs before anything is painted. The same reading as `accountHere` and `onboardedHere.has`,
 * in plain script. Anything it can't read leaves the hint off, and the chat waits for the account.
 */
export function coverHintScript(mode: AuthMode): string {
  return `(function(){try{var m=${JSON.stringify(mode)},id=m;if(m==="clerk"){id=null;var c=document.cookie.split(";");for(var i=0;i<c.length;i++){var e=c[i].indexOf("=");if(e<0||c[i].slice(0,e).trim()!=="__session")continue;var p=decodeURIComponent(c[i].slice(e+1).trim()).split(".")[1];if(p){var s=JSON.parse(atob(p.replace(/-/g,"+").replace(/_/g,"/"))).sub;if(typeof s==="string"&&s)id=s}break}}if(id&&localStorage.getItem(${JSON.stringify(ONBOARDED_PREFIX)}+id)==="1")document.documentElement.setAttribute(${JSON.stringify(COVER_HINT_ATTRIBUTE)},"")}catch(x){}})()`;
}
