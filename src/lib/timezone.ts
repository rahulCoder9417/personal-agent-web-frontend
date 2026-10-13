import type { Me } from "./api/client";

/**
 * Old names some browsers still report (Chrome says "Asia/Calcutta" in India), with the name the
 * zone has now. The agent writes the current names, and the automations list says "your time"
 * only when an automation's zone is spelled like the account's.
 */
const RENAMED: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv",
};

/**
 * The browser's own time zone, an IANA name such as "Asia/Kolkata" (an old name is given its
 * current one). Null when the browser doesn't say (an old browser, or one that hides it).
 */
export function browserTimeZone(intl: Pick<typeof Intl, "DateTimeFormat"> = Intl): string | null {
  try {
    const zone = intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof zone !== "string" || zone.length === 0) return null;
    return RENAMED[zone] ?? zone;
  } catch {
    return null;
  }
}

/** What this needs from the account. `timezoneSet` is missing from a backend that predates it. */
type Account = Pick<Me, "timezone"> & { timezoneSet?: boolean };

/**
 * The time zone to give the account from the browser, or null to leave the account as it is.
 * Only while nobody has set one: `timezoneSet` is false, so the account still has the UTC every
 * account starts with. A zone the person chose in Settings, or one set from a browser before, is
 * never replaced, also when this browser is somewhere else. A backend that doesn't say whether
 * one was set is left alone too. The browser's zone is sent even when it is UTC: that marks the
 * account as set, so it isn't asked again.
 */
export function timezoneToAdopt(account: Account | undefined, browserZone: string | null): string | null {
  if (!account || account.timezoneSet !== false || !browserZone) return null;
  return browserZone;
}

let claimed = false;

/**
 * `timezoneToAdopt`, at most once per page load, whoever asks (the app and onboarding both do):
 * the zone to set now, or null. A save that fails is not tried again until the next page load.
 */
export function claimBrowserTimezone(account: Account | undefined, browserZone: string | null): string | null {
  if (claimed) return null;
  const zone = timezoneToAdopt(account, browserZone);
  if (zone) claimed = true;
  return zone;
}

/** Tests only: as if the page had loaded again. */
export function forgetBrowserTimezoneClaim(): void {
  claimed = false;
}
