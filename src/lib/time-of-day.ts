// A time of day as the time picker reads and shows it (`TimePicker`, src/components/time-picker.tsx).
// The value is always "HH:MM" on a 24-hour clock ("09:00", "18:30"), as the API's forms keep it;
// people see "9:00 AM" and may type it however they like: "9", "9am", "930", "9:30 pm", "21:15".
// Nothing here draws.

import type { ListOption } from "./listbox";

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" from an hour and a minute, or null when either is out of range. */
export function timeValue(hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** "09:00" → "9:00 AM"; "00:05" → "12:05 AM"; "18:30" → "6:30 PM". Anything else is shown as it is. */
export function formatTime(value: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return value;
  const hour = Number(m[1]);
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${m[2]} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * What someone typed, as "HH:MM", or null when it isn't a time. "9" and "9am" are 09:00, "9pm"
 * 21:00, "930" and "9.30" 09:30, "12am" midnight, "12pm" and "noon" midday. Without AM or PM the
 * clock is 24-hour.
 */
export function parseTime(text: string): string | null {
  const typed = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!typed) return null;
  if (typed === "noon" || typed === "midday") return "12:00";
  if (typed === "midnight") return "00:00";
  const m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?\s*(a|am|a\.m\.|p|pm|p\.m\.)?$/.exec(typed);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.[0];
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  }
  return timeValue(hour, minute);
}

/** The times of a day, every `step` minutes, as options: "12:00 AM" … "11:45 PM". */
export function dayTimes(step = 15): ListOption[] {
  const out: ListOption[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += step) {
    const value = timeValue(Math.floor(minutes / 60), minutes % 60)!;
    out.push(timeOption(value));
  }
  return out;
}

function timeOption(value: string, hint?: string): ListOption {
  const [h, m] = value.split(":");
  // "9:30" and "0930" find 09:30 too, and "21" finds 9 PM.
  return { value, label: formatTime(value), hint, keywords: [value, `${Number(h)}:${m}`, `${h}${m}`] };
}

/**
 * The options the picker shows for what is typed: with nothing typed, the day's times (and the
 * chosen one, if it is between two of them); with a time typed, that time first and then the ones
 * that start like it; otherwise none.
 */
export function timeOptions(value: string | null, query: string | null, step = 15): ListOption[] {
  const base = dayTimes(step);
  if (value && /^\d{2}:\d{2}$/.test(value) && !base.some((option) => option.value === value)) {
    base.push(timeOption(value));
    base.sort((a, b) => a.value.localeCompare(b.value));
  }
  const typed = query?.trim() ?? "";
  if (!typed) return base;
  const parsed = parseTime(typed);
  const digits = typed.replace(/\D/g, "");
  const near = digits
    ? base.filter((option) => option.value !== parsed && (option.keywords ?? []).some((word) => word.replace(/\D/g, "").startsWith(digits)))
    : [];
  const exact = parsed ? [base.find((option) => option.value === parsed) ?? timeOption(parsed, "Typed")] : [];
  // A typed "pm" keeps to the afternoon among the others.
  const half = /p/i.test(typed) ? (o: ListOption) => o.value >= "12:00" : /a/i.test(typed) ? (o: ListOption) => o.value < "12:00" : () => true;
  return [...exact, ...near.filter(half)].slice(0, 24);
}
