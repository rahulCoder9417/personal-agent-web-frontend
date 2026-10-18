"use client";

import { ErrorScreen } from "@/components/error-screen";

// A page crashed. The rest of the app (sidebar, session) is still there around it.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen title="Something went wrong" message="That page ran into a problem. Try again, or go back to chat." onRetry={reset} />;
}
