import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectedOutcome } from "@/components/apps/connected-outcome";

export const metadata: Metadata = { title: "All set" };

/**
 * Where a tab opened beside the app lands after a provider's sign-in (onboarding opens those in a
 * new tab so the setup flow stays put): it says whether the app connected. The app picks the
 * change up when it gets focus again.
 */
export default function ConnectedPage() {
  return (
    <main className="grid h-full place-items-center overflow-auto p-8">
      {/* Reads the address, which needs a Suspense boundary on a page built ahead. */}
      <Suspense fallback={null}>
        <ConnectedOutcome />
      </Suspense>
    </main>
  );
}
