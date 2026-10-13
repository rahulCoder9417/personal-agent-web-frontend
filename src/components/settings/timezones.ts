import type { ListOption } from "@/lib/listbox";

/** "GMT+5:30" for a zone right now, or "" when the runtime doesn't know the zone. */
export function gmtOffset(timeZone: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(at);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function supportedZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

/**
 * Options for the time zone field: every zone the runtime knows, with its offset beside it (and
 * found by it: "5:30" finds Kolkata). The account's current zone is always in the list, even if
 * this runtime doesn't list it.
 */
export function timezoneOptions(current: string, zones: readonly string[] = supportedZones(), at = new Date()): ListOption[] {
  const all = zones.includes(current) || !current ? [...zones] : [current, ...zones];
  return all.map((value) => {
    const offset = gmtOffset(value, at);
    const label = value.replace(/_/g, " ");
    return offset ? { value, label, hint: offset } : { value, label };
  });
}
