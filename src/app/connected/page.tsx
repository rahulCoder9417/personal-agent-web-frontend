import type { Metadata } from "next";
import { AgentFigure } from "@/components/tex";

export const metadata: Metadata = { title: "All set" };

/**
 * Where a tab opened beside the app lands after a provider's sign-in (onboarding opens those in a
 * new tab so the setup flow stays put). The app picks the change up when it gets focus again.
 */
export default function ConnectedPage() {
  return (
    <main className="grid h-full place-items-center overflow-auto p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AgentFigure who="tex" mood="done" size={160} label="Tex, pleased" />
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">All set</h1>
        <p className="text-[15px] text-muted">That’s done. You can close this tab and go back to Textcrew.</p>
      </div>
    </main>
  );
}
