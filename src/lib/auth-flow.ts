// Sign-in and sign-up, the parts that need no browser: where to land afterwards, what Clerk's
// answers mean and what to say when it refuses. Clerk is the sign-in service; the forms in
// src/components/auth are this app's own, built on Clerk's hooks.

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
/** Where Google sends the browser back to when Clerk still needs something from this app. */
export const SSO_CALLBACK_PATH = "/sso-callback";

/**
 * The social sign-in providers switched on in the Clerk application (Clerk Dashboard → User &
 * authentication → SSO connections). One button each. The rest of what is switched on, and what
 * the forms are built for: email as the only identifier, a password, a code by email (to sign in
 * without the password, to verify the email at sign-up and to reset the password), optional first
 * and last name, and no second factor.
 */
export const SOCIAL_PROVIDERS = [{ strategy: "oauth_google", name: "Google", icon: "google" }] as const;

export type SocialStrategy = (typeof SOCIAL_PROVIDERS)[number]["strategy"];

// ---------------------------------------------------------------- where to land

const AUTH_PATHS = [SIGN_IN_PATH, SIGN_UP_PATH, SSO_CALLBACK_PATH];

/**
 * Where to land after signing in or up: the page the person was sent to sign in from, or the home
 * screen. Clerk's proxy passes that page as `redirect_url`, a full address. Only an address inside
 * this app is accepted, so a link to the sign-in page can't be used to send someone to another site.
 */
export function afterAuthPath(redirectUrl: string | null | undefined, origin: string): string {
  if (!redirectUrl) return "/";
  let url: URL;
  try {
    url = new URL(redirectUrl, origin);
    if (url.origin !== new URL(origin).origin) return "/";
  } catch {
    return "/";
  }
  // "https://app//other.site" is this origin with a path a browser would read as another site.
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/";
  // Landing back on a sign-in page would only bounce.
  if (AUTH_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `path` carrying the page to land on afterwards, for the links between the sign-in pages. */
export function withRedirect(path: string, redirectUrl: string | null | undefined): string {
  if (!redirectUrl || redirectUrl === "/") return path;
  return `${path}?redirect_url=${encodeURIComponent(redirectUrl)}`;
}

/**
 * A step of the sign-in form that can be opened directly (`?step=`): the page Google returns to
 * sends people there when Clerk wants a code from their inbox or a new password before it lets
 * them in. The sign-in Clerk holds for the browser carries on from that step.
 */
export type SignInEntryStep = "second-code" | "new-password";

export function signInStepPath(step: SignInEntryStep, redirectUrl: string | null | undefined): string {
  const path = withRedirect(SIGN_IN_PATH, redirectUrl);
  return `${path}${path.includes("?") ? "&" : "?"}step=${step}`;
}

/** The step a `?step=` value asks for, or null for anything else. */
export function signInEntryStep(value: string | null | undefined): SignInEntryStep | null {
  return value === "second-code" || value === "new-password" ? value : null;
}

/** One value of a query parameter, whichever way Next.js hands it over. */
export function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * This app's address as the browser sees it, from a request's headers: behind Vercel or Caddy
 * that is the forwarded host. Empty when the request doesn't say.
 */
export function requestOrigin(headers: { get(name: string): string | null }): string {
  const first = (name: string) => headers.get(name)?.split(",")[0]?.trim() || null;
  const host = first("x-forwarded-host") ?? first("host");
  if (!host) return "";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${first("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

// ---------------------------------------------------------------- what Clerk refused, in plain words

export type AuthFlow = "sign-in" | "sign-up";
export type AuthField = "email" | "password" | "code" | "firstName" | "lastName";

/** What went wrong, where to show it (`field`, or above the form) and Clerk's own code for it. */
export type AuthProblem = { field: AuthField | null; message: string; code: string };

const GENERIC = "Something went wrong. Try again.";
const OFFLINE = "Couldn’t reach the sign-in service. Check your connection and try again.";

const FIELD_OF_PARAM: Record<string, AuthField> = {
  identifier: "email",
  email_address: "email",
  emailAddress: "email",
  password: "password",
  code: "code",
  first_name: "firstName",
  firstName: "firstName",
  last_name: "lastName",
  lastName: "lastName",
};

const FIELD_NAME: Record<AuthField, string> = {
  email: "your email",
  password: "your password",
  code: "the code",
  firstName: "your first name",
  lastName: "your last name",
};

type Detail = { code: string; text: string | null; field: AuthField | null; meta: Record<string, unknown> };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The first thing Clerk said, from an API refusal (`errors: [...]`) or an error raised in the browser. */
function detailOf(error: unknown): Detail | null {
  if (!error || typeof error !== "object") return null;
  const outer = error as { errors?: unknown; code?: unknown; longMessage?: unknown };
  const first = Array.isArray(outer.errors) ? (outer.errors[0] as Record<string, unknown> | undefined) : undefined;
  if (first && typeof first === "object") {
    const meta = (first.meta && typeof first.meta === "object" ? first.meta : {}) as Record<string, unknown>;
    const param = text(meta.paramName) ?? text(meta.param_name);
    return {
      code: text(first.code) ?? "unknown",
      text: text(first.longMessage) ?? text(first.long_message) ?? text(first.message),
      field: (param && FIELD_OF_PARAM[param]) || null,
      meta,
    };
  }
  const code = text(outer.code);
  // An error raised in the browser carries a message written for developers; only its long one is for people.
  return code ? { code, text: text(outer.longMessage), field: null, meta: {} } : null;
}

function lockedFor(meta: Record<string, unknown>): string {
  const seconds = Number(meta.lockoutExpiresInSeconds ?? meta.lockout_expires_in_seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "Try again later.";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
  const hours = Math.ceil(minutes / 60);
  return `Try again in ${hours} ${hours === 1 ? "hour" : "hours"}.`;
}

/** Clerk's refusal in this app's words. Codes it doesn't know keep Clerk's own sentence. */
export function describeAuthError(error: unknown, flow: AuthFlow): AuthProblem {
  const detail = detailOf(error);
  if (!detail) {
    // A failed fetch is a TypeError in every browser.
    return { field: null, code: "unknown", message: error instanceof TypeError ? OFFLINE : GENERIC };
  }
  const { code, meta } = detail;
  const problem = (message: string, field: AuthField | null = detail.field): AuthProblem => ({ field, message, code });

  switch (code) {
    case "form_identifier_not_found":
      return problem("There’s no account with that email. Check the spelling, or create an account.", "email");
    case "form_password_incorrect":
      return problem("That password isn’t right. Try again, or reset it.", "password");
    case "form_identifier_exists":
      return problem("There’s already an account with that email. Sign in instead.", "email");
    case "form_password_pwned":
      return problem(
        flow === "sign-in"
          ? "This password has turned up in a data leak, so it can’t be used any more. Reset it to sign in."
          : "This password has turned up in a data leak. Choose a different one.",
        "password",
      );
    case "strategy_for_user_invalid":
      return problem("This account has no password. Continue with Google, or ask for a code by email.", "password");
    case "factor_not_found":
      return problem("This account can’t sign in with a code by email. Use your password or Google.", "email");
    case "form_code_incorrect":
      return problem("That code isn’t right. Check the email and try again.", "code");
    case "verification_expired":
      return problem("That code has expired. Ask for a new one.", "code");
    case "verification_failed":
      return problem("Too many wrong codes. Ask for a new one.", "code");
    case "form_param_format_invalid":
      if (detail.field === "email") return problem("That doesn’t look like an email address.");
      break;
    case "form_param_nil":
    case "form_param_missing":
      if (detail.field) return problem(`Enter ${FIELD_NAME[detail.field]}.`);
      break;
    case "too_many_requests":
      return problem("Too many tries. Wait a minute, then try again.", null);
    case "user_locked":
      return problem(`Too many wrong tries, so this account is locked for now. ${lockedFor(meta)}`, null);
    case "session_exists":
    case "identifier_already_signed_in":
      return problem("You’re already signed in.", null);
    case "not_allowed_access":
      return problem("That email can’t be used here.", "email");
    case "sign_up_mode_restricted":
    case "sign_up_restricted_waitlist":
      return problem("New accounts can’t be created right now.", null);
    case "captcha_invalid":
    case "captcha_unavailable":
      return problem("The check that you’re not a robot didn’t finish. Turn off any ad blocker for this page and try again.", null);
    case "oauth_access_denied":
      return problem("Google sign-in was cancelled.", null);
    case "external_account_exists":
      return problem("That Google account already belongs to another account here.", null);
    case "external_account_not_found":
      return problem("There’s no account for that Google account yet. Create one first.", null);
    case "client_state_invalid":
      return problem("That took too long and can’t be finished. Start again.", null);
    case "network_error":
    case "clerk_offline":
      return problem(OFFLINE, null);
  }
  return problem(detail.text ?? GENERIC);
}

// ---------------------------------------------------------------- what comes next

const SECOND_FACTOR_NAME: Record<string, string> = {
  totp: "a code from an authenticator app",
  phone_code: "a code by text message",
  backup_code: "a backup code",
  email_link: "a link by email",
};

function listOr(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export type SignInNext =
  /** Signed in: make the session the active one and go to the app. */
  | { kind: "done" }
  /** Clerk wants a code from the person's inbox first (a password used on a new device, or a second factor). */
  | { kind: "second-code" }
  /** The reset code was right; a new password is next. */
  | { kind: "new-password" }
  /** Nothing this form can do. */
  | { kind: "stuck"; message: string };

/** What the sign-in form does after Clerk answers, from the attempt's `status`. */
export function signInNextStep(status: string, secondFactors: readonly string[]): SignInNext {
  switch (status) {
    case "complete":
      return { kind: "done" };
    case "needs_new_password":
      return { kind: "new-password" };
    case "needs_client_trust":
    case "needs_second_factor": {
      if (secondFactors.includes("email_code")) return { kind: "second-code" };
      const others = secondFactors.map((factor) => SECOND_FACTOR_NAME[factor]).filter(Boolean);
      return {
        kind: "stuck",
        message: `This account asks for a second step that isn’t available here yet${others.length ? `: ${listOr(others)}` : ""}.`,
      };
    }
    default:
      return { kind: "stuck", message: "That didn’t finish signing you in. Start again." };
  }
}

const SIGN_UP_FIELD_NAME: Record<string, string> = {
  email_address: "an email address",
  password: "a password",
  first_name: "a first name",
  last_name: "a last name",
  phone_number: "a phone number",
  username: "a username",
  legal_accepted: "agreement to the terms",
};

export type SignUpNext =
  | { kind: "done" }
  /** The account is waiting for the code Clerk emails to check the address. */
  | { kind: "verify-email" }
  | { kind: "stuck"; message: string };

/** What the sign-up form does after Clerk answers. */
export function signUpNextStep(status: string, unverifiedFields: readonly string[], missingFields: readonly string[]): SignUpNext {
  if (status === "complete") return { kind: "done" };
  if (status === "abandoned") return { kind: "stuck", message: "That took too long and can’t be finished. Start again." };
  if (missingFields.length > 0) {
    const names = missingFields.map((field) => SIGN_UP_FIELD_NAME[field] ?? field.replaceAll("_", " "));
    return { kind: "stuck", message: `The account still needs ${listOr(names)}, which this page can’t ask for yet.` };
  }
  if (unverifiedFields.includes("email_address")) return { kind: "verify-email" };
  return { kind: "stuck", message: "That didn’t finish creating your account. Start again." };
}

/**
 * A session Clerk won't let be used until something else is done (a "session task"). None is
 * switched on in the Clerk application, so this only says what is in the way.
 */
export function sessionTaskMessage(key: string): string {
  if (key === "reset-password") return "Your password has to be changed before you can sign in. Use “Forgot password?” to set a new one.";
  if (key === "setup-mfa") return "This account has to set up a second step before it can be used, which isn’t available here yet.";
  if (key === "choose-organization") return "This account has to choose an organization before it can be used, which isn’t available here yet.";
  return "This account needs one more step that isn’t available here yet.";
}

// ---------------------------------------------------------------- back from Google

export type SsoSignIn = {
  status: string;
  isTransferable: boolean;
  /** The strategies of the first factors Clerk offers, when it asks for one. */
  firstFactors: readonly string[];
  existingSessionId?: string | null;
};

export type SsoSignUp = { status: string; isTransferable: boolean; existingSessionId?: string | null };

export type SsoCallbackStep =
  /** Google signed in someone who has an account. */
  | { kind: "finish-sign-in" }
  /** "Sign up with Google" by someone who already has an account: carry it over to a sign-in. */
  | { kind: "transfer-to-sign-in" }
  /** "Sign in with Google" by someone new: carry it over to a sign-up. */
  | { kind: "transfer-to-sign-up" }
  | { kind: "finish-sign-up" }
  /** Clerk wants something the sign-in form asks for (a password, a code, a new password). */
  | { kind: "continue-sign-in" }
  /** That Google account is already signed in on this browser. */
  | { kind: "use-session"; sessionId: string }
  /** Nothing is waiting: the page was opened by hand, or Google sign-in was cancelled. */
  | { kind: "nothing" };

/**
 * What the callback page does when the browser comes back from Google, from the state of the
 * sign-in and the sign-up Clerk holds for this browser. The order is the one Clerk's own callback
 * (`HandleSSOCallback` in @clerk/react) checks them in.
 */
export function ssoCallbackStep(signIn: SsoSignIn, signUp: SsoSignUp): SsoCallbackStep {
  if (signIn.status === "complete") return { kind: "finish-sign-in" };
  if (signUp.isTransferable) return { kind: "transfer-to-sign-in" };
  if (signIn.status === "needs_first_factor" && !signIn.firstFactors.every((factor) => factor === "enterprise_sso")) {
    return { kind: "continue-sign-in" };
  }
  if (signIn.isTransferable) return { kind: "transfer-to-sign-up" };
  if (signUp.status === "complete") return { kind: "finish-sign-up" };
  if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust" || signIn.status === "needs_new_password") {
    return { kind: "continue-sign-in" };
  }
  const sessionId = signIn.existingSessionId || signUp.existingSessionId;
  if (sessionId) return { kind: "use-session", sessionId };
  return { kind: "nothing" };
}
