import { builtAuthMode } from "@/lib/auth-mode";
import { authMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness, which auth mode the server is in, and which one the pages were built in (`builtMode`).
 * The two differ only when the server's environment isn't the one the app was built with.
 */
export function GET(): Response {
  const mode = authMode();
  return Response.json({ status: "ok", mode, demo: mode === "demo", builtMode: builtAuthMode() });
}
