"use client";

import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import {
  afterAuthPath,
  describeAuthError,
  SIGN_IN_PATH,
  signInNextStep,
  signInStepPath,
  signUpNextStep,
  ssoCallbackStep,
  withRedirect,
} from "@/lib/auth-flow";
import { CaptchaSlot, ok, useFinish } from "./parts";

/** The spinner the page shows while Clerk finishes. */
export function FinishingSignIn() {
  return (
    <p role="status" className="flex items-center gap-2.5 py-14 text-[14px] text-muted">
      <Spinner />
      Finishing sign-in…
    </p>
  );
}

/**
 * The callback for the page in the address: `?redirect_url=` is the page to land on afterwards.
 * Read in the browser, so the page itself can be static.
 */
export function SsoCallbackFromAddress() {
  return <SsoCallback redirectUrl={useSearchParams().get("redirect_url")} />;
}

/**
 * Where the browser comes back to from Google when Clerk still needs this app: to turn a sign-in
 * by someone new into an account, a sign-up by someone known into a sign-in, or to say what went
 * wrong. (When nothing more is needed, Clerk sends the browser straight to the app instead.)
 * It finishes with Clerk's API and shows nothing but a spinner while it does.
 */
export function SsoCallback({ redirectUrl }: { redirectUrl: string | null }) {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  const finish = useFinish(redirectUrl);
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  /**
   * A sign-in that Google didn't finish by itself: signs in if nothing more is needed, hands over
   * to the sign-in form for what it can ask for, and answers what is in the way otherwise.
   */
  const carryOn = async (): Promise<string | null> => {
    const next = signInNextStep(
      signIn.status,
      signIn.supportedSecondFactors.map((factor) => factor.strategy),
    );
    switch (next.kind) {
      case "done":
        return finish((params) => signIn.finalize(params));
      case "second-code":
        await ok(signIn.mfa.sendEmailCode());
        router.replace(signInStepPath("second-code", redirectUrl));
        return null;
      case "new-password":
        router.replace(signInStepPath("new-password", redirectUrl));
        return null;
      case "stuck":
        // Clerk wants a password or a code first: the sign-in form asks for both.
        if (signIn.status !== "needs_first_factor") return next.message;
        router.replace(withRedirect(SIGN_IN_PATH, redirectUrl));
        return null;
    }
  };

  const complete = useEffectEvent(async () => {
    try {
      const step = ssoCallbackStep(
        {
          status: signIn.status,
          isTransferable: signIn.isTransferable,
          firstFactors: signIn.supportedFirstFactors.map((factor) => factor.strategy),
          existingSessionId: signIn.existingSession?.sessionId,
        },
        { status: signUp.status, isTransferable: signUp.isTransferable, existingSessionId: signUp.existingSession?.sessionId },
      );
      let blocked: string | null = null;

      switch (step.kind) {
        case "finish-sign-in":
          blocked = await finish((params) => signIn.finalize(params));
          break;
        case "transfer-to-sign-in":
          await ok(signIn.create({ transfer: true }));
          blocked = await carryOn();
          break;
        case "transfer-to-sign-up": {
          await ok(signUp.create({ transfer: true }));
          const next = signUpNextStep(signUp.status, signUp.unverifiedFields, signUp.missingFields);
          if (next.kind === "done") blocked = await finish((params) => signUp.finalize(params));
          else if (next.kind === "stuck") blocked = next.message;
          else blocked = "Your email address still has to be checked, which this page can’t do yet. Create the account with your email and a password instead.";
          break;
        }
        case "finish-sign-up":
          blocked = await finish((params) => signUp.finalize(params));
          break;
        case "continue-sign-in":
          blocked = await carryOn();
          break;
        case "use-session":
          blocked = await finish(async (params) => {
            await clerk.setActive({ session: step.sessionId, ...params });
            return { error: null };
          });
          break;
        case "nothing": {
          // Clerk keeps what the provider refused (a cancelled consent screen, say) on the attempt.
          const refused = signIn.firstFactorVerification.error ?? signUp.verifications.externalAccount.error;
          if (refused) blocked = describeAuthError({ errors: [refused] }, "sign-in").message;
          else if (clerk.isSignedIn) router.replace(afterAuthPath(redirectUrl, window.location.origin));
          else blocked = "That sign-in didn’t finish. Try again.";
        }
      }
      if (blocked) setProblem(blocked);
    } catch (caught) {
      setProblem(describeAuthError(caught, "sign-in").message);
    }
  });

  const ready = clerk.loaded;
  useEffect(() => {
    // Once: the page re-renders while the session is being made active.
    if (!ready || started.current) return;
    started.current = true;
    void complete();
  }, [ready]);

  // Clerk's script never arrived, so there is nothing to finish with.
  const shown = problem ?? (clerk.status === "error" ? "The sign-in service didn’t load. Check your connection, turn off any ad blocker for this page and try again." : null);

  return (
    <div className="flex flex-col items-center">
      {shown ? (
        <EmptyState
          mood="paused"
          title="Sign-in didn’t finish"
          action={
            <ButtonLink href={withRedirect(SIGN_IN_PATH, redirectUrl)} variant="primary" size="lg">
              Back to sign in
            </ButtonLink>
          }
        >
          <span role="alert">{shown}</span>
        </EmptyState>
      ) : (
        <FinishingSignIn />
      )}
      {/* Turning a sign-in into a new account may need the robot check. */}
      <CaptchaSlot />
    </div>
  );
}
