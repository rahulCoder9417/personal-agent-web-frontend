import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame, NoSignIn } from "@/components/auth/auth-frame";
import { FinishingSignIn, SsoCallbackFromAddress } from "@/components/auth/sso-callback";
import { builtAuthMode } from "@/lib/auth-mode";

export const metadata: Metadata = { title: "Signing in" };

/**
 * Where Google sends the browser back to when Clerk still needs this app to finish the sign-in.
 * Static, served from the CDN; the proxy leads home when there are no accounts.
 */
export default function SsoCallbackPage() {
  // Only Clerk mode has a sign-in to finish.
  if (builtAuthMode() !== "clerk") return <NoSignIn />;

  return (
    <AuthFrame>
      <Suspense fallback={<FinishingSignIn />}>
        <SsoCallbackFromAddress />
      </Suspense>
    </AuthFrame>
  );
}
