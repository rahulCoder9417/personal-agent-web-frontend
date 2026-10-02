import { authMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness, and which auth mode the server is in. */
export function GET(): Response {
  const mode = authMode();
  return Response.json({ status: "ok", mode, demo: mode === "demo" });
}
