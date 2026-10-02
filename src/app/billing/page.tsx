import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentFigure } from "@/components/tex";
import { authMode } from "@/lib/env";

export const metadata: Metadata = { title: "Billing" };

/**
 * The address the backend sends people to for billing:
 * - Polar returns here after checkout (`/billing?checkout=done`);
 * - Tex links here from chat when credits run out.
 *
 * Signed in, it forwards to Plans (which watches for the payment to land). Not signed in happens
 * when checkout was started from the desktop app and ran in a browser with no session: then it
 * just confirms, and the change shows up in the app by itself.
 */
export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const done = (await searchParams).checkout === "done";
  const signedIn = authMode() !== "clerk" || Boolean((await auth()).userId);

  if (signedIn) redirect(done ? "/settings/plans?checkout=done" : "/settings/plans");
  if (!done) redirect("/sign-in");

  return (
    <main className="grid h-full place-items-center overflow-auto p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AgentFigure who="tex" mood="done" size={160} label="Tex, pleased" />
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Payment received</h1>
        <p className="text-[15px] text-muted">
          Thanks. You can close this tab and go back to Textcrew; your plan and credits update there within a few seconds.
        </p>
      </div>
    </main>
  );
}
