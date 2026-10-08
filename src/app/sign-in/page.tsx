import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame, NoSignIn } from "@/components/auth/auth-frame";
import { SignInForm, SignInFromAddress } from "@/components/auth/sign-in-form";
import { builtAuthMode } from "@/lib/auth-mode";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Static, served from the CDN. The proxy does what needs the request: it sends someone who is
 * already signed in on to the page they came for, and leads home when there are no accounts.
 */
export default function SignInPage() {
  // Only Clerk mode has accounts to sign in to.
  if (builtAuthMode() !== "clerk") return <NoSignIn />;

  return (
    <AuthFrame>
      {/* The address is read in the browser; until then the form stands in as it opens without one. */}
      <Suspense fallback={<SignInForm redirectUrl={null} entry={null} />}>
        <SignInFromAddress />
      </Suspense>
    </AuthFrame>
  );
}
