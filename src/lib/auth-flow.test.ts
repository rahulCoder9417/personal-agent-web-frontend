import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  afterAuthPath,
  afterSignUpPath,
  describeAuthError,
  dropsLeftoverSignIn,
  firstParam,
  requestOrigin,
  sessionTaskMessage,
  signInEntryStep,
  signInNextStep,
  signInStepPath,
  signUpNextStep,
  SOCIAL_PROVIDERS,
  ssoCallbackStep,
  WELCOME_PATH,
  withRedirect,
  type SsoSignIn,
  type SsoSignUp,
} from "./auth-flow";

const ORIGIN = "https://app.textcrew.in";

describe("afterAuthPath", () => {
  it("lands on the home screen when nothing was asked for", () => {
    expect(afterAuthPath(null, ORIGIN)).toBe("/");
    expect(afterAuthPath(undefined, ORIGIN)).toBe("/");
    expect(afterAuthPath("", ORIGIN)).toBe("/");
  });

  it("goes back to the page the proxy sent the person from, which arrives as a full address", () => {
    expect(afterAuthPath("https://app.textcrew.in/pricing?checkout=done", ORIGIN)).toBe("/pricing?checkout=done");
    expect(afterAuthPath("https://app.textcrew.in/automations/reviews#acme", ORIGIN)).toBe("/automations/reviews#acme");
    expect(afterAuthPath("http://localhost:3000/onboarding?step=2", "http://localhost:3000")).toBe("/onboarding?step=2");
  });

  it("takes a path inside the app as well", () => {
    expect(afterAuthPath("/apps", ORIGIN)).toBe("/apps");
    expect(afterAuthPath("/settings/memory?memory=mem_1", ORIGIN)).toBe("/settings/memory?memory=mem_1");
  });

  it("never leaves the app", () => {
    expect(afterAuthPath("https://evil.example/steal", ORIGIN)).toBe("/");
    expect(afterAuthPath("//evil.example/steal", ORIGIN)).toBe("/");
    expect(afterAuthPath("/\\evil.example", ORIGIN)).toBe("/");
    expect(afterAuthPath("https://app.textcrew.in//evil.example", ORIGIN)).toBe("/");
    expect(afterAuthPath("https://app.textcrew.in.evil.example/", ORIGIN)).toBe("/");
    expect(afterAuthPath("http://app.textcrew.in/apps", ORIGIN)).toBe("/");
    expect(afterAuthPath("javascript:alert(1)", ORIGIN)).toBe("/");
    expect(afterAuthPath("data:text/html,hi", ORIGIN)).toBe("/");
  });

  it("doesn't land back on a sign-in page", () => {
    expect(afterAuthPath("/sign-in", ORIGIN)).toBe("/");
    expect(afterAuthPath("https://app.textcrew.in/sign-up?redirect_url=%2Fapps", ORIGIN)).toBe("/");
    expect(afterAuthPath("/sso-callback", ORIGIN)).toBe("/");
    expect(afterAuthPath("/sign-in/anything", ORIGIN)).toBe("/");
    // A page that only starts with the same letters is an ordinary page.
    expect(afterAuthPath("/sign-in-help", ORIGIN)).toBe("/sign-in-help");
  });

  it("falls back to the home screen when the app's own address can't be read", () => {
    expect(afterAuthPath("/apps", "")).toBe("/");
    expect(afterAuthPath("https://app.textcrew.in/apps", "not an address")).toBe("/");
  });
});

describe("afterSignUpPath", () => {
  it("takes a new account straight to the welcome flow instead of the home screen", () => {
    expect(afterSignUpPath(null, ORIGIN)).toBe("/onboarding");
    // Opening app.textcrew.in signed out: the proxy sends its home address along.
    expect(afterSignUpPath("https://app.textcrew.in/", ORIGIN)).toBe("/onboarding");
    expect(afterSignUpPath("/", ORIGIN)).toBe("/onboarding");
  });

  it("is a page of this app", () => {
    expect(WELCOME_PATH).toBe("/onboarding");
    expect(existsSync(join(import.meta.dirname, "..", "app", WELCOME_PATH, "page.tsx"))).toBe(true);
  });

  it("keeps a page the person was sent from, as a sign-in does", () => {
    expect(afterSignUpPath("https://app.textcrew.in/pricing?checkout=done", ORIGIN)).toBe("/pricing?checkout=done");
    expect(afterSignUpPath("/apps", ORIGIN)).toBe("/apps");
    // The home screen with something asked for (a request typed in) is not the plain home screen.
    expect(afterSignUpPath("/?draft=hello", ORIGIN)).toBe("/?draft=hello");
  });

  it("never leaves the app, and never lands on a sign-in page", () => {
    expect(afterSignUpPath("https://evil.example/steal", ORIGIN)).toBe("/onboarding");
    expect(afterSignUpPath("//evil.example/steal", ORIGIN)).toBe("/onboarding");
    expect(afterSignUpPath("/sign-up", ORIGIN)).toBe("/onboarding");
    expect(afterSignUpPath("/sso-callback", ORIGIN)).toBe("/onboarding");
  });
});

describe("withRedirect", () => {
  it("carries the page to land on between the sign-in pages", () => {
    expect(withRedirect("/sign-up", "https://app.textcrew.in/apps?tab=mcp")).toBe(
      "/sign-up?redirect_url=https%3A%2F%2Fapp.textcrew.in%2Fapps%3Ftab%3Dmcp",
    );
    expect(withRedirect("/sso-callback", "/pricing")).toBe("/sso-callback?redirect_url=%2Fpricing");
  });

  it("adds nothing when there is nowhere special to land", () => {
    expect(withRedirect("/sign-up", null)).toBe("/sign-up");
    expect(withRedirect("/sign-up", "")).toBe("/sign-up");
    expect(withRedirect("/sso-callback", "/")).toBe("/sso-callback");
  });

  it("survives the round trip", () => {
    const link = new URL(withRedirect("/sign-in", "https://app.textcrew.in/apps?a=1&b=2#top"), ORIGIN);
    expect(afterAuthPath(link.searchParams.get("redirect_url"), ORIGIN)).toBe("/apps?a=1&b=2#top");
  });
});

describe("signInStepPath", () => {
  it("opens the sign-in form on a later step, keeping the page to land on", () => {
    expect(signInStepPath("second-code", null)).toBe("/sign-in?step=second-code");
    expect(signInStepPath("new-password", "/")).toBe("/sign-in?step=new-password");
    expect(signInStepPath("second-code", "/apps?tab=mcp")).toBe("/sign-in?redirect_url=%2Fapps%3Ftab%3Dmcp&step=second-code");
  });

  it("is read back by the sign-in page", () => {
    const link = new URL(signInStepPath("second-code", "/apps"), ORIGIN);
    expect(signInEntryStep(link.searchParams.get("step"))).toBe("second-code");
    expect(afterAuthPath(link.searchParams.get("redirect_url"), ORIGIN)).toBe("/apps");
  });
});

describe("signInEntryStep", () => {
  it("accepts only the steps that can be opened directly", () => {
    expect(signInEntryStep("second-code")).toBe("second-code");
    expect(signInEntryStep("new-password")).toBe("new-password");
    for (const value of ["start", "email-code", "reset-code", "", "1", null, undefined]) expect(signInEntryStep(value)).toBeNull();
  });
});

describe("requestOrigin", () => {
  const from = (values: Record<string, string>) => requestOrigin({ get: (name) => values[name] ?? null });

  it("is the address the browser used, behind Vercel or Caddy", () => {
    expect(from({ "x-forwarded-host": "app.textcrew.in", "x-forwarded-proto": "https", host: "web:3000" })).toBe("https://app.textcrew.in");
    expect(from({ host: "app.textcrew.in" })).toBe("https://app.textcrew.in");
    expect(from({ "x-forwarded-host": "app.textcrew.in, internal", "x-forwarded-proto": "https,http" })).toBe("https://app.textcrew.in");
  });

  it("is plain http on this machine", () => {
    expect(from({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(from({ host: "127.0.0.1:3000" })).toBe("http://127.0.0.1:3000");
  });

  it("is empty when the request doesn't say, which sends people to the home screen", () => {
    expect(from({})).toBe("");
    expect(afterAuthPath("https://app.textcrew.in/apps", from({}))).toBe("/");
  });
});

describe("firstParam", () => {
  it("reads one value however the query string repeats it", () => {
    expect(firstParam("/apps")).toBe("/apps");
    expect(firstParam(["/apps", "/other"])).toBe("/apps");
    expect(firstParam(undefined)).toBeNull();
    expect(firstParam([])).toBeNull();
  });
});

/** A refusal from Clerk's API, the way its browser SDK hands it over. */
function refusal(code: string, extra: { message?: string; longMessage?: string; meta?: Record<string, unknown> } = {}) {
  return { clerkError: true, code: "api_response_error", status: 422, errors: [{ code, message: extra.message ?? code, ...extra }] };
}

describe("describeAuthError", () => {
  it("puts an unknown email and a wrong password under their fields", () => {
    expect(describeAuthError(refusal("form_identifier_not_found", { meta: { paramName: "identifier" } }), "sign-in")).toEqual({
      field: "email",
      code: "form_identifier_not_found",
      message: "There’s no account with that email. Check the spelling, or create an account.",
    });
    expect(describeAuthError(refusal("form_password_incorrect", { meta: { paramName: "password" } }), "sign-in")).toEqual({
      field: "password",
      code: "form_password_incorrect",
      message: "That password isn’t right. Try again, or reset it.",
    });
  });

  it("says an email is taken at sign-up", () => {
    expect(describeAuthError(refusal("form_identifier_exists", { meta: { paramName: "email_address" } }), "sign-up")).toMatchObject({
      field: "email",
      message: "There’s already an account with that email. Sign in instead.",
    });
  });

  it("explains a leaked password differently when signing in and when choosing one", () => {
    const leaked = refusal("form_password_pwned", { meta: { paramName: "password" } });
    expect(describeAuthError(leaked, "sign-in").message).toBe(
      "This password has turned up in a data leak, so it can’t be used any more. Reset it to sign in.",
    );
    expect(describeAuthError(leaked, "sign-up").message).toBe("This password has turned up in a data leak. Choose a different one.");
    expect(describeAuthError(leaked, "sign-up").field).toBe("password");
  });

  it("keeps Clerk's own sentence for a password rule, which carries the number", () => {
    const tooShort = refusal("form_password_length_too_short", {
      message: "Passwords must be 15 characters or more.",
      meta: { paramName: "password" },
    });
    expect(describeAuthError(tooShort, "sign-up")).toEqual({
      field: "password",
      code: "form_password_length_too_short",
      message: "Passwords must be 15 characters or more.",
    });
  });

  it("prefers Clerk's longer sentence when there are two", () => {
    const error = refusal("form_password_not_strong_enough", { message: "Weak.", longMessage: "Add another word or two.", meta: { paramName: "password" } });
    expect(describeAuthError(error, "sign-up").message).toBe("Add another word or two.");
  });

  it("puts code problems under the code", () => {
    expect(describeAuthError(refusal("form_code_incorrect", { meta: { paramName: "code" } }), "sign-in")).toMatchObject({
      field: "code",
      message: "That code isn’t right. Check the email and try again.",
    });
    expect(describeAuthError(refusal("verification_expired"), "sign-up")).toMatchObject({ field: "code", message: "That code has expired. Ask for a new one." });
    expect(describeAuthError(refusal("verification_failed"), "sign-in")).toMatchObject({ field: "code", message: "Too many wrong codes. Ask for a new one." });
  });

  it("names the field that is empty or badly formed", () => {
    expect(describeAuthError(refusal("form_param_format_invalid", { meta: { paramName: "email_address" } }), "sign-up")).toMatchObject({
      field: "email",
      message: "That doesn’t look like an email address.",
    });
    expect(describeAuthError(refusal("form_param_nil", { meta: { paramName: "password" } }), "sign-in")).toMatchObject({
      field: "password",
      message: "Enter your password.",
    });
    expect(describeAuthError(refusal("form_param_missing", { meta: { paramName: "identifier" } }), "sign-in")).toMatchObject({
      field: "email",
      message: "Enter your email.",
    });
    // A field this form doesn't have keeps Clerk's sentence, above the form.
    expect(describeAuthError(refusal("form_param_format_invalid", { message: "Phone is invalid.", meta: { paramName: "phone_number" } }), "sign-up")).toEqual({
      field: null,
      code: "form_param_format_invalid",
      message: "Phone is invalid.",
    });
  });

  it("says an account made with Google has no password", () => {
    expect(describeAuthError(refusal("strategy_for_user_invalid"), "sign-in")).toMatchObject({
      field: "password",
      message: "This account has no password. Continue with Google, or ask for a code by email.",
    });
  });

  it("says how long a locked account stays locked", () => {
    const message = (seconds?: number) =>
      describeAuthError(refusal("user_locked", { meta: seconds === undefined ? {} : { lockoutExpiresInSeconds: seconds } }), "sign-in").message;
    expect(message(1800)).toBe("Too many wrong tries, so this account is locked for now. Try again in 30 minutes.");
    expect(message(45)).toBe("Too many wrong tries, so this account is locked for now. Try again in 1 minute.");
    expect(message(3600)).toBe("Too many wrong tries, so this account is locked for now. Try again in 1 hour.");
    expect(message(5400)).toBe("Too many wrong tries, so this account is locked for now. Try again in 2 hours.");
    expect(message()).toBe("Too many wrong tries, so this account is locked for now. Try again later.");
  });

  it("puts what isn't about one field above the form", () => {
    expect(describeAuthError(refusal("too_many_requests"), "sign-in")).toMatchObject({ field: null, message: "Too many tries. Wait a minute, then try again." });
    expect(describeAuthError(refusal("session_exists"), "sign-in")).toMatchObject({ field: null, message: "You’re already signed in." });
    expect(describeAuthError(refusal("oauth_access_denied"), "sign-in")).toMatchObject({ field: null, message: "Google sign-in was cancelled." });
    expect(describeAuthError(refusal("captcha_invalid"), "sign-up").message).toMatch(/not a robot/);
    expect(describeAuthError(refusal("sign_up_mode_restricted"), "sign-up").message).toBe("New accounts can’t be created right now.");
  });

  it("reads an error raised in the browser by its code, not by its developer message", () => {
    const raised = { clerkError: true, code: "network_error", message: 'Clerk: Network error at "/v1/client/sign_ins" (code="network_error")' };
    expect(describeAuthError(raised, "sign-in")).toEqual({
      field: null,
      code: "network_error",
      message: "Couldn’t reach the sign-in service. Check your connection and try again.",
    });
    expect(describeAuthError({ code: "factor_not_found", message: "Clerk: Email code factor not found" }, "sign-in")).toMatchObject({
      field: "email",
      message: "This account can’t sign in with a code by email. Use your password or Google.",
    });
    expect(describeAuthError({ code: "something_new", message: "Clerk: internal detail" }, "sign-in").message).toBe("Something went wrong. Try again.");
    expect(describeAuthError({ code: "something_new", message: "internal", longMessage: "Please try another browser." }, "sign-in").message).toBe(
      "Please try another browser.",
    );
  });

  it("has something to say whatever is thrown", () => {
    expect(describeAuthError(new TypeError("Failed to fetch"), "sign-in").message).toBe(
      "Couldn’t reach the sign-in service. Check your connection and try again.",
    );
    for (const thrown of [new Error("boom"), null, undefined, "nope", 42, {}, { errors: [] }]) {
      expect(describeAuthError(thrown, "sign-up")).toEqual({ field: null, code: "unknown", message: "Something went wrong. Try again." });
    }
  });
});

describe("signInNextStep", () => {
  it("finishes a complete sign-in", () => {
    expect(signInNextStep("complete", [])).toEqual({ kind: "done" });
  });

  it("asks for the emailed code when a password is used on a new device", () => {
    expect(signInNextStep("needs_client_trust", ["email_code"])).toEqual({ kind: "second-code" });
    expect(signInNextStep("needs_second_factor", ["totp", "email_code"])).toEqual({ kind: "second-code" });
  });

  it("says which second step it can't do", () => {
    expect(signInNextStep("needs_second_factor", ["totp", "backup_code"])).toEqual({
      kind: "stuck",
      message: "This account asks for a second step that isn’t available here yet: a code from an authenticator app or a backup code.",
    });
    expect(signInNextStep("needs_second_factor", ["phone_code"])).toEqual({
      kind: "stuck",
      message: "This account asks for a second step that isn’t available here yet: a code by text message.",
    });
    expect(signInNextStep("needs_client_trust", [])).toEqual({
      kind: "stuck",
      message: "This account asks for a second step that isn’t available here yet.",
    });
  });

  it("asks for a new password once the reset code is accepted", () => {
    expect(signInNextStep("needs_new_password", [])).toEqual({ kind: "new-password" });
  });

  it("starts again from anything else", () => {
    for (const status of ["needs_identifier", "needs_first_factor", "needs_protect_check", "something_new"]) {
      expect(signInNextStep(status, ["email_code"])).toEqual({ kind: "stuck", message: "That didn’t finish signing you in. Start again." });
    }
  });
});

describe("dropsLeftoverSignIn", () => {
  const idle = { firstStep: true, working: false };

  it("drops an attempt Clerk still holds when the first step is showing, so Google starts a new one", () => {
    // What a refused password or a Google round trip back to this page leaves behind.
    expect(dropsLeftoverSignIn("sia_left_behind", idle)).toBe(true);
  });

  it("leaves things alone when Clerk holds no attempt (a fresh page, or one already dropped)", () => {
    expect(dropsLeftoverSignIn(undefined, idle)).toBe(false);
    expect(dropsLeftoverSignIn(null, idle)).toBe(false);
    expect(dropsLeftoverSignIn("", idle)).toBe(false);
  });

  it("keeps the attempt a request in flight is making, such as the one taking the browser to Google", () => {
    expect(dropsLeftoverSignIn("sia_in_flight", { firstStep: true, working: true })).toBe(false);
  });

  it("keeps the attempt the later steps carry on: a code, a second code, a new password", () => {
    expect(dropsLeftoverSignIn("sia_carried_on", { firstStep: false, working: false })).toBe(false);
  });
});

describe("signUpNextStep", () => {
  it("finishes a complete sign-up", () => {
    expect(signUpNextStep("complete", [], [])).toEqual({ kind: "done" });
  });

  it("asks for the emailed code while the address is unverified", () => {
    expect(signUpNextStep("missing_requirements", ["email_address"], [])).toEqual({ kind: "verify-email" });
  });

  it("names what it can't ask for", () => {
    expect(signUpNextStep("missing_requirements", ["email_address"], ["phone_number"])).toEqual({
      kind: "stuck",
      message: "The account still needs a phone number, which this page can’t ask for yet.",
    });
    expect(signUpNextStep("missing_requirements", [], ["username", "legal_accepted", "favourite_colour"])).toEqual({
      kind: "stuck",
      message: "The account still needs a username, agreement to the terms or favourite colour, which this page can’t ask for yet.",
    });
  });

  it("starts again when the attempt ran out of time or nothing is left to do", () => {
    expect(signUpNextStep("abandoned", [], [])).toEqual({ kind: "stuck", message: "That took too long and can’t be finished. Start again." });
    expect(signUpNextStep("missing_requirements", [], [])).toEqual({ kind: "stuck", message: "That didn’t finish creating your account. Start again." });
  });
});

describe("sessionTaskMessage", () => {
  it("says what is in the way", () => {
    expect(sessionTaskMessage("reset-password")).toMatch(/Forgot password/);
    expect(sessionTaskMessage("setup-mfa")).toMatch(/second step/);
    expect(sessionTaskMessage("choose-organization")).toMatch(/organization/);
    expect(sessionTaskMessage("something-new")).toBe("This account needs one more step that isn’t available here yet.");
  });
});

describe("ssoCallbackStep", () => {
  const signIn = (over: Partial<SsoSignIn> = {}): SsoSignIn => ({ status: "needs_identifier", isTransferable: false, firstFactors: [], ...over });
  const signUp = (over: Partial<SsoSignUp> = {}): SsoSignUp => ({ status: "missing_requirements", isTransferable: false, ...over });

  it("finishes the sign-in of someone who has an account", () => {
    expect(ssoCallbackStep(signIn({ status: "complete" }), signUp())).toEqual({ kind: "finish-sign-in" });
  });

  it("turns a sign-in by someone new into a sign-up", () => {
    expect(ssoCallbackStep(signIn({ isTransferable: true }), signUp())).toEqual({ kind: "transfer-to-sign-up" });
  });

  it("turns a sign-up by someone who has an account into a sign-in", () => {
    expect(ssoCallbackStep(signIn(), signUp({ isTransferable: true }))).toEqual({ kind: "transfer-to-sign-in" });
    // Also when an older sign-in is still lying around half done.
    expect(ssoCallbackStep(signIn({ status: "needs_first_factor", firstFactors: ["password"] }), signUp({ isTransferable: true }))).toEqual({
      kind: "transfer-to-sign-in",
    });
  });

  it("finishes a sign-up Google completed", () => {
    expect(ssoCallbackStep(signIn(), signUp({ status: "complete" }))).toEqual({ kind: "finish-sign-up" });
  });

  it("hands over to the sign-in form when Clerk wants something more", () => {
    expect(ssoCallbackStep(signIn({ status: "needs_first_factor", firstFactors: ["password", "email_code"] }), signUp())).toEqual({ kind: "continue-sign-in" });
    for (const status of ["needs_second_factor", "needs_client_trust", "needs_new_password"]) {
      expect(ssoCallbackStep(signIn({ status }), signUp())).toEqual({ kind: "continue-sign-in" });
    }
  });

  it("prefers carrying a new person over to a sign-up when the only first factor is company sign-in", () => {
    expect(ssoCallbackStep(signIn({ status: "needs_first_factor", firstFactors: ["enterprise_sso"], isTransferable: true }), signUp())).toEqual({
      kind: "transfer-to-sign-up",
    });
  });

  it("uses the session that Google account already has on this browser", () => {
    expect(ssoCallbackStep(signIn({ existingSessionId: "sess_1" }), signUp())).toEqual({ kind: "use-session", sessionId: "sess_1" });
    expect(ssoCallbackStep(signIn(), signUp({ existingSessionId: "sess_2" }))).toEqual({ kind: "use-session", sessionId: "sess_2" });
  });

  it("does nothing when nothing is waiting", () => {
    expect(ssoCallbackStep(signIn(), signUp())).toEqual({ kind: "nothing" });
    expect(ssoCallbackStep(signIn({ existingSessionId: null }), signUp({ existingSessionId: "" }))).toEqual({ kind: "nothing" });
  });
});

describe("SOCIAL_PROVIDERS", () => {
  it("is the one provider switched on in the Clerk application", () => {
    expect(SOCIAL_PROVIDERS.map((provider) => provider.strategy)).toEqual(["oauth_google"]);
  });
});
