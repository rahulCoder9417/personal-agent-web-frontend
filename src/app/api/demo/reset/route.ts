import type { NextRequest } from "next/server";
import { resetDemoStore } from "@/lib/demo";
import { syncAgentSettings } from "@/lib/demo/handlers-setup";
import { authMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Demo mode only: starts the demo account over, as someone who has just signed up
 * (`?account=new`) or as the account in use for three weeks (`?account=seeded`, the default).
 * `&ai=own_only` takes Textcrew AI off offer, as the beta runs, so a new account has no AI until
 * one is connected (`&ai=platform` puts it back; without it, `TEXTCREW_DEMO_AI_ACCESS_MODE` says).
 * Reload the app afterwards. Anywhere else this route isn't there (404).
 */
export function POST(request: NextRequest): Response {
  if (authMode() !== "demo") return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  const query = request.nextUrl.searchParams;
  const account = query.get("account") === "new" ? "new" : "seeded";
  const state = resetDemoStore(new Date(), account);
  const ai = query.get("ai");
  if (ai === "own_only" || ai === "platform") {
    state.aiMode = ai;
    syncAgentSettings(state);
  }
  return Response.json({ account, userId: state.user.id, aiAccess: state.agentSettings.aiAccess });
}
