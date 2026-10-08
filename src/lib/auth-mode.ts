// How requests are authenticated, worked out from the environment. No Next.js or Node imports:
// next.config.ts runs it once when the app is built, and the server runs it again on every request.

/**
 * - "demo": the proxy answers from an in-memory account; no backend, no sign-in.
 *   On when asked for (`TEXTCREW_DEMO=1`) or when nothing else is configured.
 * - "dev-token": the real backend, as the one user `TEXTCREW_DEV_TOKEN` belongs to (development only).
 * - "clerk": the real backend with Clerk sign-in.
 */
export type AuthMode = "demo" | "dev-token" | "clerk";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * A fixed session token for working against a local backend without Clerk (`pnpm backend:local`
 * prints one). It is ignored in a production build, so it can never stand in for real sign-in there.
 */
export function devTokenFrom(env: Env): string | null {
  const token = env.TEXTCREW_DEV_TOKEN?.trim();
  if (!token || env.NODE_ENV === "production") return null;
  return token;
}

export function decideAuthMode(env: Env): AuthMode {
  if (env.TEXTCREW_DEMO === "1") return "demo";
  if (devTokenFrom(env)) return "dev-token";
  return env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY ? "clerk" : "demo";
}

export function parseAuthMode(value: string | undefined): AuthMode | null {
  return value === "demo" || value === "dev-token" || value === "clerk" ? value : null;
}

/**
 * The mode the pages were built in. next.config.ts decides it once, when the app is built, and
 * Next.js writes it into the code as a constant, so the pages can be prerendered and served from
 * the CDN and every page of one build agrees. The proxy and the API route still read the
 * environment on every request (`authMode()` in env.ts); on Vercel and in the Dockerfile the build
 * and the server see the same values. Where nothing was written in (tests), it is worked out from
 * the environment.
 */
export function builtAuthMode(): AuthMode {
  return parseAuthMode(process.env.NEXT_PUBLIC_TEXTCREW_AUTH_MODE) ?? decideAuthMode(process.env);
}
