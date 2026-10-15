"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useMe } from "@/lib/api/hooks";
import { homeView, welcomeLeft } from "@/lib/onboarding";
import { ErrorState, Spinner } from "../ui";

/**
 * Whether the address asked for something (`?draft=`, `?chat=`), as it was when the chat opened:
 * the chat tidies those away once it has them, and that mustn't then send the person to the flow.
 * Reading the address needs a Suspense boundary on a page built ahead.
 */
function ReadAsked({ onRead }: { onRead: (asked: boolean | null) => void }) {
  const params = useSearchParams();
  const [asked] = useState(() => params.has("draft") || params.has("chat"));
  useEffect(() => {
    onRead(asked);
    // Read again the next time the chat opens.
    return () => onRead(null);
  }, [asked, onRead]);
  return null;
}

/** The whole window, with nothing of the app on it: a spinner, or why the account didn't load. */
function Holding({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="grid h-dvh place-items-center overflow-auto bg-bg px-4">
      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : (
        <p role="status" className="text-muted">
          <Spinner size={20} />
          <span className="sr-only">Loading</span>
        </p>
      )}
    </div>
  );
}

/**
 * The signed-in app (`children`, its sidebar and all), or on the chat (`home`) the welcome flow
 * first while the account says it hasn't been finished or skipped (`homeView` in
 * src/lib/onboarding.ts). There, nothing of the app is drawn until the account has loaded, so a
 * new account sees a spinner and then the flow, never the chat on the way. The other pages show
 * at once. Kept the same shape on every page, so moving between them doesn't draw the app afresh.
 */
export function WelcomeGate({ home, children }: { home: boolean; children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const [asked, setAsked] = useState<boolean | null>(null);
  const failed = me.isError && me.fetchStatus !== "fetching";
  const view = home ? homeView({ me: me.data, failed, asked, leftThisVisit: welcomeLeft.get() }) : "app";

  useEffect(() => {
    if (view === "wait") router.prefetch("/onboarding");
    if (view === "welcome") router.replace("/onboarding");
  }, [view, router]);

  return (
    <>
      {home && (
        <Suspense fallback={null}>
          <ReadAsked onRead={setAsked} />
        </Suspense>
      )}
      {view === "app" ? children : <Holding error={view === "error" ? me.error : null} onRetry={() => me.refetch()} />}
    </>
  );
}
