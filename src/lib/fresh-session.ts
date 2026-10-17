// The sign-in token the proxy reads is fresh when a call leaves the page.
//
// Clerk's session token lasts 60 seconds. Clerk's script in the page renews it about every 50
// seconds and when the window gets focus, and writes it to the cookie the proxy reads. In a tab
// left in the background the renewal can lag, and a call then goes out with an expired token. For a
// GET, Clerk renews it on the server (one more trip to Clerk). For a POST it doesn't: the call is
// refused with 401. That is how sending a message failed with "Sign in to continue" on 17 October
// at 05:10:39 (the message and the wake-up together), with a GET of the same moment going through.
//
// So before each call through the proxy the page asks Clerk's script for the token: the one it has
// while it is still good (no wait at all), a new one otherwise, which it writes to the cookie before
// the call goes. Calls at the same moment share one renewal. It never holds a call long: after
// `RENEW_WAIT_MS` the call goes anyway, as it did before.

/** Renews the token when it has to; resolves when the cookie holds a good one. */
export type Renewer = () => Promise<unknown>;

/** The longest a call waits for the token. */
export const RENEW_WAIT_MS = 4_000;

let renewer: Renewer | null = null;
let renewing: Promise<void> | null = null;

/** Set by the page once Clerk's script is in it (null: no sign-in here, nothing to renew). */
export function setRenewer(next: Renewer | null): void {
  renewer = next;
  renewing = null;
}

/** Resolves once the token is good, or after `waitMs`, whichever is first. Never rejects. */
export function freshSession(waitMs = RENEW_WAIT_MS): Promise<void> {
  const renew = renewer;
  if (!renew) return Promise.resolve();
  if (!renewing) {
    const current = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, waitMs);
      Promise.resolve()
        .then(renew)
        .catch(() => {})
        .finally(() => {
          clearTimeout(timer);
          resolve();
        });
    });
    renewing = current;
    void current.then(() => {
      if (renewing === current) renewing = null;
    });
  }
  return renewing;
}
