import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame, NoSignIn } from "@/components/auth/auth-frame";
import { SignUpForm, SignUpFromAddress } from "@/components/auth/sign-up-form";
import { builtAuthMode } from "@/lib/auth-mode";

export const metadata: Metadata = { title: "Create an account" };

/**
 * Static, served from the CDN. The proxy does what needs the request: it sends someone who is
 * already signed in on to the page they came for, and leads home when there are no accounts.
 */
export default function SignUpPage() {
  // Only Clerk mode has accounts to create.
  if (builtAuthMode() !== "clerk") return <NoSignIn />;

  return (
    <AuthFrame>
      {/* The address is read in the browser; until then the form stands in as it opens without one. */}
      <Suspense fallback={<SignUpForm redirectUrl={null} />}>
        <SignUpFromAddress />
      </Suspense>
    </AuthFrame>
  );
}
