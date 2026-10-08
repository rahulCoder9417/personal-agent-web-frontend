import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { afterAuthPath, firstParam, requestOrigin } from "@/lib/auth-flow";
import { authMode } from "@/lib/env";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  // Only Clerk mode has accounts to create.
  if (authMode() !== "clerk") redirect("/");

  // The page the person was first sent to sign in from; they land there once the account exists.
  const redirectUrl = firstParam((await searchParams).redirect_url);
  // Someone who is signed in has nothing to do here.
  if ((await auth()).userId) redirect(afterAuthPath(redirectUrl, requestOrigin(await headers())));

  return (
    <AuthFrame>
      <SignUpForm redirectUrl={redirectUrl} />
    </AuthFrame>
  );
}
