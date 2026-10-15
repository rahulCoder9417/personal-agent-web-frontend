"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useMe } from "@/lib/api/hooks";
import { rememberOnboarded } from "@/lib/onboarded-here";
import { useOnboardedHere } from "@/lib/use-onboarded-here";
import { cn } from "@/lib/format";
import { homeView, welcomeLeft } from "@/lib/onboarding";
import { useAppConfig } from "../shell/providers";
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

/**
 * Over the whole window, so nothing of the app shows: a spinner, or why the account didn't load.
 * It comes before the app in the page, so it is there before any of the app arrives. The spinner's
 * cover is hidden before the first paint where this browser remembers the account finishing the
 * flow (`.welcome-cover` in globals.css), while React hasn't read that yet.
 */
function Holding({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className={cn("fixed inset-0 z-[100] grid place-items-center overflow-auto bg-bg px-4", !error && "welcome-cover")}>
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
 * src/lib/onboarding.ts).
 *
 * Where this browser remembers that the signed-in account has done the flow, the chat shows at
 * once. Otherwise the account is waited for under a spinner, so a new account sees the spinner and
 * then the flow, never the chat on the way. While it waits, the app is already drawn under the
 * spinner, so its own requests (the chats, the crew, the approvals…) go out alongside the
 * account's instead of after it. The other pages show at once. Kept the same shape on every page,
 * so moving between them doesn't draw the app afresh.
 */
export function WelcomeGate({ home, children }: { home: boolean; children: ReactNode }) {
  const router = useRouter();
  const { mode } = useAppConfig();
  const me = useMe();
  const remembered = useOnboardedHere(mode);
  const [asked, setAsked] = useState<boolean | null>(null);
  const failed = me.isError && me.fetchStatus !== "fetching";
  const view = home ? homeView({ me: me.data, failed, asked, leftThisVisit: welcomeLeft.get(), remembered }) : "app";

  useEffect(() => {
    if (view === "wait") router.prefetch("/onboarding");
    if (view === "welcome") router.replace("/onboarding");
  }, [view, router]);

  // The note follows the account, on every page: set once it says the flow is done, dropped when
  // it says it isn't (shown again from Settings, or reset). Not from an answer still being checked.
  const completedAt = me.data?.onboardingCompletedAt;
  const settled = !me.isFetching;
  useEffect(() => {
    if (settled) rememberOnboarded(mode, completedAt);
  }, [mode, completedAt, settled]);

  return (
    <>
      {home && (
        <Suspense fallback={null}>
          <ReadAsked onRead={setAsked} />
        </Suspense>
      )}
      {view !== "app" && <Holding error={view === "error" ? me.error : null} onRetry={() => me.refetch()} />}
      {/* Not while the account failed to load: drawn again once it has, its requests go out afresh. */}
      {view !== "error" && children}
    </>
  );
}
