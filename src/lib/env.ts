// Server-side configuration. Read at request time so one build works in every environment.

/** Base URL of the Textcrew backend (the `api` process), without a trailing slash. */
export function apiBaseUrl(): string {
  return (process.env.TEXTCREW_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

/** True when both Clerk keys are set, so real sign-in can run. */
export function hasClerkKeys(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

/**
 * A fixed session token for working against a local backend without Clerk (`pnpm backend:local`
 * prints one). It is ignored in a production build, so it can never stand in for real sign-in there.
 */
export function devToken(): string | null {
  const token = process.env.TEXTCREW_DEV_TOKEN?.trim();
  if (!token || process.env.NODE_ENV === "production") return null;
  return token;
}

/**
 * How requests are authenticated:
 * - "demo": the proxy answers from an in-memory account; no backend, no sign-in.
 *   On when asked for (`TEXTCREW_DEMO=1`) or when nothing else is configured.
 * - "dev-token": the real backend, as the one user `TEXTCREW_DEV_TOKEN` belongs to (development only).
 * - "clerk": the real backend with Clerk sign-in.
 */
export type AuthMode = "demo" | "dev-token" | "clerk";

export function authMode(): AuthMode {
  if (process.env.TEXTCREW_DEMO === "1") return "demo";
  if (devToken()) return "dev-token";
  return hasClerkKeys() ? "clerk" : "demo";
}

export function isDemoMode(): boolean {
  return authMode() === "demo";
}
