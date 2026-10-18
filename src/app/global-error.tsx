"use client";

import { ErrorScreen } from "@/components/error-screen";
import "./globals.css";

// The last resort: the root layout itself crashed, so this brings its own <html> and <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        <ErrorScreen title="Something went wrong" message="Textcrew ran into a problem. Try again, or go back to chat." onRetry={reset} />
      </body>
    </html>
  );
}
