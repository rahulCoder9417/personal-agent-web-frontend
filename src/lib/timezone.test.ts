import { beforeEach, describe, expect, it } from "vitest";
import { browserTimeZone, claimBrowserTimezone, forgetBrowserTimezoneClaim, timezoneToAdopt } from "./timezone";

const intlSaying = (timeZone: unknown) => ({
  DateTimeFormat: (() => ({ resolvedOptions: () => ({ timeZone }) })) as unknown as typeof Intl.DateTimeFormat,
});

describe("browserTimeZone", () => {
  it("is the zone the browser reports", () => {
    expect(browserTimeZone(intlSaying("Asia/Kolkata"))).toBe("Asia/Kolkata");
    expect(browserTimeZone(intlSaying("America/New_York"))).toBe("America/New_York");
    // The real one, in whatever zone the tests run.
    expect(browserTimeZone()).toBeTruthy();
  });

  it("gives an old name the zone's current one", () => {
    expect(browserTimeZone(intlSaying("Asia/Calcutta"))).toBe("Asia/Kolkata");
    expect(browserTimeZone(intlSaying("Europe/Kiev"))).toBe("Europe/Kyiv");
    expect(browserTimeZone(intlSaying("Asia/Saigon"))).toBe("Asia/Ho_Chi_Minh");
  });

  it("is null when the browser doesn't say, or can't be asked", () => {
    expect(browserTimeZone(intlSaying(undefined))).toBeNull();
    expect(browserTimeZone(intlSaying(""))).toBeNull();
    const broken = {
      DateTimeFormat: (() => {
        throw new RangeError("no Intl");
      }) as unknown as typeof Intl.DateTimeFormat,
    };
    expect(browserTimeZone(broken)).toBeNull();
  });
});

describe("timezoneToAdopt", () => {
  const unset = { timezone: "UTC", timezoneSet: false };

  it("gives an account nobody set a zone for the browser's", () => {
    expect(timezoneToAdopt(unset, "Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("also when the browser is in UTC, so the account counts as set and isn't asked again", () => {
    expect(timezoneToAdopt(unset, "UTC")).toBe("UTC");
  });

  it("never replaces a zone someone set, also one that is UTC or differs from this browser's", () => {
    expect(timezoneToAdopt({ timezone: "Europe/London", timezoneSet: true }, "Asia/Kolkata")).toBeNull();
    expect(timezoneToAdopt({ timezone: "UTC", timezoneSet: true }, "Asia/Kolkata")).toBeNull();
  });

  it("leaves the account alone when the backend doesn't say, the account isn't loaded, or the browser has no zone", () => {
    expect(timezoneToAdopt({ timezone: "UTC" }, "Asia/Kolkata")).toBeNull();
    expect(timezoneToAdopt(undefined, "Asia/Kolkata")).toBeNull();
    expect(timezoneToAdopt(unset, null)).toBeNull();
  });
});

describe("claimBrowserTimezone", () => {
  beforeEach(() => forgetBrowserTimezoneClaim());

  it("answers once per page load, whoever asks", () => {
    expect(claimBrowserTimezone(undefined, "Asia/Kolkata")).toBeNull();
    // Not claimed while there was nothing to set: the account loading later still gets it.
    expect(claimBrowserTimezone({ timezone: "UTC", timezoneSet: false }, "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(claimBrowserTimezone({ timezone: "UTC", timezoneSet: false }, "Asia/Kolkata")).toBeNull();
    forgetBrowserTimezoneClaim();
    expect(claimBrowserTimezone({ timezone: "UTC", timezoneSet: false }, "Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("never claims for an account whose zone was set", () => {
    expect(claimBrowserTimezone({ timezone: "Asia/Kolkata", timezoneSet: true }, "America/New_York")).toBeNull();
    expect(claimBrowserTimezone({ timezone: "UTC", timezoneSet: false }, "America/New_York")).toBe("America/New_York");
  });
});
