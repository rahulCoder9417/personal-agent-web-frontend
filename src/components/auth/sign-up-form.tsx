"use client";

import { useClerk, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Card, Field } from "@/components/ui";
import {
  afterAuthPath,
  describeAuthError,
  SIGN_IN_PATH,
  signUpNextStep,
  SSO_CALLBACK_PATH,
  withRedirect,
  type AuthField,
  type AuthProblem,
  type SocialStrategy,
} from "@/lib/auth-flow";
import {
  AuthHeading,
  CaptchaSlot,
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

/** start: Google, or name, email and password. verify: the code Clerk emails to check the address. */
type Step = "start" | "verify";

/** The request in flight, named for the control that shows it. */
type Busy = "submit" | "social" | "resend";

const optional = <span className="font-normal text-muted">(optional)</span>;

/**
 * The form as the address asks for it: `?redirect_url=` is the page to land on once the account
 * exists. Read in the browser, so the page itself can be static.
 */
export function SignUpFromAddress() {
  return <SignUpForm redirectUrl={useSearchParams().get("redirect_url")} />;
}

/**
 * Creating an account, built on Clerk's `useSignUp()`: this app draws the form, Clerk creates the
 * user, emails the code and creates the session. The backend hears about the new user from Clerk.
 */
export function SignUpForm({ redirectUrl }: { redirectUrl: string | null }) {
  const clerk = useClerk();
  const { signUp } = useSignUp();
  const finish = useFinish(redirectUrl);
  const id = useId();

  const [step, setStep] = useState<Step>("start");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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
      setProblem(describeAuthError(caught, "sign-up"));
    }
    setBusy(null);
  };

  /** Acts on what Clerk says the sign-up needs now. `codeSent` is true once the person is entering the code. */
  const advance = async (codeSent: boolean): Promise<boolean> => {
    const next = signUpNextStep(signUp.status, signUp.unverifiedFields, signUp.missingFields);
    switch (next.kind) {
      case "done": {
        const blocked = await finish((params) => signUp.finalize(params));
        if (blocked) fail(null, blocked);
        return !blocked;
      }
      case "verify-email":
        if (codeSent) {
          fail("code", "That code didn’t verify your email. Ask for a new one.");
          return false;
        }
        await ok(signUp.verifications.sendEmailCode());
        setCode("");
        setStep("verify");
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return fail("email", "Enter your email.");
    if (!password) return fail("password", "Choose a password.");
    const first = firstName.trim();
    const last = lastName.trim();
    void run("submit", async () => {
      await ok(signUp.password({ emailAddress: address, password, ...(first && { firstName: first }), ...(last && { lastName: last }) }));
      return advance(false);
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) return fail("code", `Enter the ${CODE_LENGTH}-digit code from the email.`);
    void run("submit", async () => {
      await ok(signUp.verifications.verifyEmailCode({ code }));
      return advance(true);
    });
  };

  const resend = () =>
    void run("resend", async () => {
      await ok(signUp.verifications.sendEmailCode());
      setCode("");
      setNote("A new code is on its way.");
      return false;
    });

  const startOver = () => {
    void signUp.reset();
    setStep("start");
    setCode("");
    setProblem(null);
    setNote(null);
  };

  const continueWith = (strategy: SocialStrategy) =>
    void run("social", async () => {
      const destination = afterAuthPath(redirectUrl, window.location.origin);
      await ok(signUp.sso({ strategy, redirectUrl: destination, redirectCallbackUrl: withRedirect(SSO_CALLBACK_PATH, destination) }));
      // By now the browser is on its way to the provider. If Clerk had no address to send it to, act on what it says instead.
      return signUp.verifications.externalAccount.externalVerificationRedirectURL ? true : advance(false);
    });

  /** Typing in a field takes its error away. */
  const edit = (field: AuthField, set: (value: string) => void) => (value: string) => {
    set(value);
    if (problem?.field === field) setProblem(null);
  };

  const working = busy !== null;
  const alreadySignedIn = problem?.code === "session_exists" || problem?.code === "identifier_already_signed_in";

  return (
    <div className="flex flex-col gap-5">
      {step === "start" ? (
        <AuthHeading title="Create your Textcrew account">Got a lot of work? Just text your crew.</AuthHeading>
      ) : (
        <AuthHeading title="Check your email">
          We sent a {CODE_LENGTH}-digit code to {signUp.emailAddress || email.trim() || "your email"}. Enter it to finish creating your account.
        </AuthHeading>
      )}

      <Card className="flex flex-col gap-4 p-5 shadow-soft">
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
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1 max-sm:gap-4">
                <Field label={<>First name {optional}</>} htmlFor={`${id}-first`} error={fieldError(problem, "firstName")}>
                  <TextInput
                    id={`${id}-first`}
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => edit("firstName", setFirstName)(event.target.value)}
                  />
                </Field>
                <Field label={<>Last name {optional}</>} htmlFor={`${id}-last`} error={fieldError(problem, "lastName")}>
                  <TextInput
                    id={`${id}-last`}
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => edit("lastName", setLastName)(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Email" htmlFor={`${id}-email`} error={fieldError(problem, "email")}>
                <TextInput
                  id={`${id}-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => edit("email", setEmail)(event.target.value)}
                />
              </Field>
              <Field label="Password" htmlFor={`${id}-password`} error={fieldError(problem, "password")}>
                <PasswordInput
                  id={`${id}-password`}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => edit("password", setPassword)(event.target.value)}
                />
              </Field>
              <div>
                <CaptchaSlot />
                <Button type="submit" variant="primary" size="lg" className="w-full" pending={busy === "submit"} disabled={working}>
                  Create account
                </Button>
              </div>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <form onSubmit={submitCode} noValidate className="flex flex-col gap-4">
              <Field label="Code" htmlFor={`${id}-code`} error={fieldError(problem, "code")}>
                <CodeInput id={`${id}-code`} autoFocus value={code} onChange={edit("code", setCode)} />
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full" pending={busy === "submit"} disabled={working}>
                Verify and continue
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
      </Card>

      {step === "start" && <SwitchLine question="Already have an account?" href={withRedirect(SIGN_IN_PATH, redirectUrl)} action="Sign in" />}
    </div>
  );
}
