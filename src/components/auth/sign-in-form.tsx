"use client";

import { useClerk, useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Field } from "@/components/ui";
import {
  afterAuthPath,
  describeAuthError,
  SIGN_UP_PATH,
  signInEntryStep,
  signInNextStep,
  SSO_CALLBACK_PATH,
  withRedirect,
  type AuthField,
  type AuthProblem,
  type SignInEntryStep,
  type SocialStrategy,
} from "@/lib/auth-flow";
import {
  AuthBody,
  AuthHeading,
  CODE_LENGTH,
  CodeInput,
  fieldError,
  FormAlert,
  FormNote,
  LinkButton,
  ok,
  PasswordInput,
  SocialButtons,
  SwitchLine,
  TextInput,
  useFinish,
} from "./parts";

/**
 * - start: Google, or email and password. From here also a code by email instead of the
 *   password, and "Forgot password?".
 * - email-code: the code that signs in without the password.
 * - second-code: the password was right, and Clerk wants a code from the inbox as well (a new device).
 * - reset-code, then new-password: a forgotten password.
 */
type Step = "start" | "email-code" | "second-code" | "reset-code" | "new-password";

/** The request in flight, named for the control that shows it. */
type Busy = "submit" | "social" | "code" | "reset" | "resend";

const HEADING: Record<Step, { title: string; body: (email: string) => string }> = {
  start: { title: "Sign in to Textcrew", body: () => "Welcome back. Your crew is ready when you are." },
  "email-code": { title: "Check your email", body: (email) => `We sent a ${CODE_LENGTH}-digit code to ${email}. Enter it to sign in.` },
  "second-code": {
    title: "Check your email",
    body: (email) => `To keep your account safe, we sent a ${CODE_LENGTH}-digit code to ${email}. Enter it to finish signing in.`,
  },
  "reset-code": { title: "Reset your password", body: (email) => `We sent a ${CODE_LENGTH}-digit code to ${email}. Enter it to choose a new password.` },
  "new-password": { title: "Choose a new password", body: () => "Once it’s saved, you’re signed in." },
};

/**
 * The form as the address asks for it: `?redirect_url=` is the page to land on afterwards and
 * `?step=` the step to open on. Read in the browser, so the page itself can be static.
 */
export function SignInFromAddress() {
  const params = useSearchParams();
  return <SignInForm redirectUrl={params.get("redirect_url")} entry={signInEntryStep(params.get("step"))} />;
}

/**
 * Signing in, built on Clerk's `useSignIn()`: this app draws the form, Clerk checks the password
 * or the code and creates the session. `redirectUrl` is the page the person was sent here from.
 * `entry` opens the form on a later step, for a sign-in Clerk already holds: the page Google
 * returns to hands over that way.
 */
export function SignInForm({ redirectUrl, entry }: { redirectUrl: string | null; entry: SignInEntryStep | null }) {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const finish = useFinish(redirectUrl);
  const id = useId();

  const [step, setStep] = useState<Step>(entry ?? "start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fail = (field: AuthField | null, message: string) => {
    setNote(null);
    setProblem({ field, message, code: "form" });
  };

  /** One step against Clerk. `work` answers true when the browser is leaving the page, so the button keeps spinning. */
  const run = async (action: Busy, work: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(action);
    setProblem(null);
    setNote(null);
    try {
      if (await work()) return;
    } catch (caught) {
      setProblem(describeAuthError(caught, "sign-in"));
    }
    setBusy(null);
  };

  /** Acts on what Clerk says the sign-in needs now. */
  const advance = async (): Promise<boolean> => {
    const next = signInNextStep(
      signIn.status,
      signIn.supportedSecondFactors.map((factor) => factor.strategy),
    );
    switch (next.kind) {
      case "done": {
        const blocked = await finish((params) => signIn.finalize(params));
        if (blocked) fail(null, blocked);
        return !blocked;
      }
      case "second-code":
        await ok(signIn.mfa.sendEmailCode());
        setCode("");
        setStep("second-code");
        return false;
      case "new-password":
        setStep("new-password");
        return false;
      case "stuck":
        fail(null, next.message);
        return false;
    }
  };

  useEffect(() => {
    // Back from Google with the browser's back button, the page returns as it was left: mid-spin.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  /** The email as typed, or null after saying why it is needed. */
  const typedEmail = (whenMissing: string): string | null => {
    const address = email.trim();
    if (!address) fail("email", whenMissing);
    return address || null;
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    const address = typedEmail("Enter your email.");
    if (!address) return;
    if (!password) return fail("password", "Enter your password.");
    void run("submit", async () => {
      await ok(signIn.password({ emailAddress: address, password }));
      return advance();
    });
  };

  const sendEmailCode = () => {
    const address = typedEmail("Enter your email first, and we’ll send the code there.");
    if (!address) return;
    void run("code", async () => {
      await ok(signIn.emailCode.sendCode({ emailAddress: address }));
      setCode("");
      setStep("email-code");
      return false;
    });
  };

  const forgotPassword = () => {
    const address = typedEmail("Enter your email first, and we’ll send a code to reset the password.");
    if (!address) return;
    void run("reset", async () => {
      await ok(signIn.create({ identifier: address }));
      await ok(signIn.resetPasswordEmailCode.sendCode());
      setCode("");
      setNewPassword("");
      setStep("reset-code");
      return false;
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) return fail("code", `Enter the ${CODE_LENGTH}-digit code from the email.`);
    void run("submit", async () => {
      if (step === "email-code") await ok(signIn.emailCode.verifyCode({ code }));
      else if (step === "second-code") await ok(signIn.mfa.verifyEmailCode({ code }));
      else await ok(signIn.resetPasswordEmailCode.verifyCode({ code }));
      return advance();
    });
  };

  const resend = () =>
    void run("resend", async () => {
      if (step === "email-code") await ok(signIn.emailCode.sendCode());
      else if (step === "second-code") await ok(signIn.mfa.sendEmailCode());
      else await ok(signIn.resetPasswordEmailCode.sendCode());
      setCode("");
      setNote("A new code is on its way.");
      return false;
    });

  const submitNewPassword = (event: FormEvent) => {
    event.preventDefault();
    if (!newPassword) return fail("password", "Choose a new password.");
    void run("submit", async () => {
      await ok(signIn.resetPasswordEmailCode.submitPassword({ password: newPassword, signOutOfOtherSessions: true }));
      return advance();
    });
  };

  const startOver = () => {
    void signIn.reset();
    setStep("start");
    setPassword("");
    setCode("");
    setNewPassword("");
    setProblem(null);
    setNote(null);
  };

  const continueWith = (strategy: SocialStrategy) =>
    void run("social", async () => {
      const destination = afterAuthPath(redirectUrl, window.location.origin);
      await ok(signIn.sso({ strategy, redirectUrl: destination, redirectCallbackUrl: withRedirect(SSO_CALLBACK_PATH, destination) }));
      // By now the browser is on its way to the provider. If Clerk had no address to send it to, act on what it says instead.
      return signIn.firstFactorVerification.externalVerificationRedirectURL ? true : advance();
    });

  /** Typing in a field takes its error away. */
  const edit = (field: AuthField, set: (value: string) => void) => (value: string) => {
    set(value);
    if (problem?.field === field) setProblem(null);
  };

  const working = busy !== null;
  const heading = HEADING[step];
  const alreadySignedIn = problem?.code === "session_exists" || problem?.code === "identifier_already_signed_in";

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title={heading.title}>{heading.body(signIn.identifier || email.trim() || "your email")}</AuthHeading>

      <AuthBody>
        {clerk.status === "error" && (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            The sign-in service didn’t load. Check your connection, turn off any ad blocker for this page and reload.
          </p>
        )}
        <FormAlert problem={problem}>
          {alreadySignedIn && (
            <>
              {" "}
              <Link href="/" className="font-medium underline">
                Open Textcrew
              </Link>
            </>
          )}
        </FormAlert>
        <FormNote>{note}</FormNote>

        {step === "start" && (
          <>
            <SocialButtons busy={busy === "social"} disabled={working} onPick={continueWith} />
            <form onSubmit={submitPassword} noValidate className="flex flex-col gap-4">
              <Field label="Email" htmlFor={`${id}-email`} error={fieldError(problem, "email")}>
                <TextInput
                  id={`${id}-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => edit("email", setEmail)(event.target.value)}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Field label="Password" htmlFor={`${id}-password`} error={fieldError(problem, "password")}>
                  <PasswordInput
                    id={`${id}-password`}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => edit("password", setPassword)(event.target.value)}
                  />
                </Field>
                <LinkButton className="self-end" disabled={working} onClick={forgotPassword}>
                  {busy === "reset" ? "Sending a code…" : "Forgot password?"}
                </LinkButton>
              </div>
              <Button type="submit" variant="primary" size="lg" className="w-full" pending={busy === "submit"} disabled={working}>
                Sign in
              </Button>
            </form>
            <LinkButton className="self-center" disabled={working} onClick={sendEmailCode}>
              {busy === "code" ? "Sending a code…" : "Email me a code instead"}
            </LinkButton>
          </>
        )}

        {(step === "email-code" || step === "second-code" || step === "reset-code") && (
          <>
            <form onSubmit={submitCode} noValidate className="flex flex-col gap-4">
              <Field label="Code" htmlFor={`${id}-code`} error={fieldError(problem, "code")}>
                <CodeInput id={`${id}-code`} autoFocus value={code} onChange={edit("code", setCode)} />
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full" pending={busy === "submit"} disabled={working}>
                {step === "reset-code" ? "Continue" : "Sign in"}
              </Button>
            </form>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <LinkButton disabled={working} onClick={resend}>
                {busy === "resend" ? "Sending…" : "Send a new code"}
              </LinkButton>
              <LinkButton disabled={working} onClick={startOver}>
                Use a different email
              </LinkButton>
            </div>
          </>
        )}

        {step === "new-password" && (
          <>
            <form onSubmit={submitNewPassword} noValidate className="flex flex-col gap-4">
              {/* Lets a password manager file the new password under the right account. */}
              <input type="email" autoComplete="username" value={signIn.identifier || email} readOnly tabIndex={-1} aria-hidden className="sr-only" />
              <Field
                label="New password"
                htmlFor={`${id}-new-password`}
                error={fieldError(problem, "password")}
                hint="Saving it signs you out on your other devices."
              >
                <PasswordInput
                  id={`${id}-new-password`}
                  autoFocus
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => edit("password", setNewPassword)(event.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full" pending={busy === "submit"} disabled={working}>
                Save and sign in
              </Button>
            </form>
            <LinkButton className="self-center" disabled={working} onClick={startOver}>
              Back to sign in
            </LinkButton>
          </>
        )}
      </AuthBody>

      {step === "start" && <SwitchLine question="New to Textcrew?" href={withRedirect(SIGN_UP_PATH, redirectUrl)} action="Create an account" />}
    </div>
  );
}
