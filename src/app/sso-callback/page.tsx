import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SsoCallback } from "@/components/auth/sso-callback";
import { firstParam } from "@/lib/auth-flow";
import { authMode } from "@/lib/env";

export const metadata: Metadata = { title: "Signing in" };

/** Where Google sends the browser back to when Clerk still needs this app to finish the sign-in. */
export default async function SsoCallbackPage({ searchParams }: PageProps<"/sso-callback">) {
  // Only Clerk mode has a sign-in to finish.
  if (authMode() !== "clerk") redirect("/");

  return (
    <AuthFrame>
      <SsoCallback redirectUrl={firstParam((await searchParams).redirect_url)} />
    </AuthFrame>
  );
}
