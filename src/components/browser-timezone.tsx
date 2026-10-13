"use client";

import { useEffect } from "react";
import { useMe, useUpdateMe } from "@/lib/api/hooks";
import { browserTimeZone, claimBrowserTimezone } from "@/lib/timezone";

/**
 * Gives a new account the browser's time zone, once, so "every morning at 9" means 9 where the
 * person is and not 9 in UTC. Only while nobody has set one (`timezoneSet` false); a zone chosen
 * in Settings is never replaced. Silent: nothing is shown, and a failure is tried again on the
 * next page load. Draws nothing.
 */
export function BrowserTimezone() {
  const me = useMe();
  const { mutate } = useUpdateMe();
  useEffect(() => {
    const zone = claimBrowserTimezone(me.data, browserTimeZone());
    if (zone) mutate({ timezone: zone });
  }, [me.data, mutate]);
  return null;
}
