import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/shell/brand";
import { authMode } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  // Only Clerk mode has accounts to sign in to.
  if (authMode() !== "clerk") redirect("/");

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center px-5">
        <Brand />
      </header>
      <main className="scroll-pane grid min-h-0 flex-1 place-items-center overflow-y-auto p-8">
        <div className="flex flex-col items-center gap-5">
          <div className="text-center">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Sign in to Textcrew</h1>
            <p className="mt-1 text-muted">Got a lot of work? Just text your crew.</p>
          </div>
          <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/" />
        </div>
      </main>
    </div>
  );
}
