// Server-side configuration, read at request time. The proxy and the API route use it; the pages
// use the mode they were built in (`builtAuthMode()` in auth-mode.ts).

import { decideAuthMode, devTokenFrom, type AuthMode } from "./auth-mode";

export type { AuthMode } from "./auth-mode";

/** The environment, with NODE_ENV as Next.js writes it into the build ("production" in a production build). */
function serverEnv() {
  return { ...process.env, NODE_ENV: process.env.NODE_ENV };
}

/** Base URL of the Textcrew backend (the `api` process), without a trailing slash. */
export function apiBaseUrl(): string {
  return (process.env.TEXTCREW_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

/** The development token, if one is set and this isn't a production build. */
export function devToken(): string | null {
  return devTokenFrom(serverEnv());
}

/** How this request is authenticated (see `AuthMode`). */
export function authMode(): AuthMode {
  return decideAuthMode(serverEnv());
}

export function isDemoMode(): boolean {
  return authMode() === "demo";
}
