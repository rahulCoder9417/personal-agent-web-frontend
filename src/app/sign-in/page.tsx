import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "@/components/auth/sign-in-form";
import { afterAuthPath, firstParam, requestOrigin, signInEntryStep } from "@/lib/auth-flow";
import { authMode } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  // Only Clerk mode has accounts to sign in to.
  if (authMode() !== "clerk") redirect("/");

  const query = await searchParams;
  // The page the proxy sent the person here from; they land there once signed in.
  const redirectUrl = firstParam(query.redirect_url);
  // Someone who is signed in has nothing to do here.
  if ((await auth()).userId) redirect(afterAuthPath(redirectUrl, requestOrigin(await headers())));

  return (
    <AuthFrame>
      <SignInForm redirectUrl={redirectUrl} entry={signInEntryStep(firstParam(query.step))} />
    </AuthFrame>
  );
}
