// A day on a calendar, as the date picker reads and shows it (`DatePicker`,
// src/components/date-picker.tsx). A day is "YYYY-MM-DD", as the API's forms keep it, with no time
// and no time zone: the picker works on the calendar alone. Weeks start on Monday. Nothing here draws.

export type Day = string;

const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));
/** Monday first. */
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function isDay(text: string | null | undefined): text is Day {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? "");
  if (!m) return false;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return at.getUTCFullYear() === Number(m[1]) && at.getUTCMonth() === Number(m[2]) - 1 && at.getUTCDate() === Number(m[3]);
}

function toUtc(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(at: Date): Day {
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

export function dayOf(year: number, month: number, date: number): Day {
  return fromUtc(new Date(Date.UTC(year, month - 1, date)));
}

/** The browser's own today, for the picker's "Today" when no time zone is given. */
export function localToday(now = new Date()): Day {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(day: Day, by: number): Day {
  const at = toUtc(day);
  at.setUTCDate(at.getUTCDate() + by);
  return fromUtc(at);
}

/** The same date `by` months on, or the month's last day when it is shorter (31 Jan + 1 → 28 Feb). */
export function addMonths(day: Day, by: number): Day {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + by, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return dayOf(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, last));
}

/** 0 for Monday … 6 for Sunday. */
export function weekdayOf(day: Day): number {
  return (toUtc(day).getUTCDay() + 6) % 7;
}

/** The first day of the month a day is in. */
export function monthOf(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

/** "October 2026". */
export function monthTitle(day: Day): string {
  const [y, m] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Tue 20 Oct 2026": a day as the closed picker shows it. */
export function formatDayShort(day: Day): string {
  if (!isDay(day)) return day;
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAY_SHORT[weekdayOf(day)]} ${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "Tuesday 20 October 2026": a day as a screen reader hears it. */
export function formatDayLong(day: Day): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAY_LONG[weekdayOf(day)]} ${d} ${MONTHS[m - 1]} ${y}`;
}

export type GridDay = { day: Day; inMonth: boolean };

/** The weeks of the month a day is in, Monday to Sunday, with the days before and after it to fill them. */
export function monthGrid(day: Day): GridDay[][] {
  const first = monthOf(day);
  const start = addDays(first, -weekdayOf(first));
  const month = first.slice(0, 7);
  const weeks: GridDay[][] = [];
  for (let at = start; weeks.length === 0 || at.slice(0, 7) === month; ) {
    const week: GridDay[] = [];
    for (let i = 0; i < 7; i++, at = addDays(at, 1)) week.push({ day: at, inMonth: at.slice(0, 7) === month });
    weeks.push(week);
  }
  return weeks;
}

/** What a key does in the calendar: move to a day, choose the one the keys are on, or close. */
export type CalendarAction = { kind: "move"; day: Day } | { kind: "pick"; day: Day } | { kind: "close" } | null;

/**
 * A key in the calendar's grid (WAI-ARIA's date picker dialog): the arrows move a day or a week,
 * Home and End to the week's Monday and Sunday, Page Up and Page Down a month (with Shift, a year),
 * Enter and Space choose, Escape closes. A move never goes before `min`.
 */
export function calendarKey(key: string, focus: Day, options: { shift?: boolean; min?: Day | null } = {}): CalendarAction {
  const clamp = (day: Day) => (options.min && day < options.min ? options.min : day);
  switch (key) {
    case "ArrowLeft":
      return { kind: "move", day: clamp(addDays(focus, -1)) };
    case "ArrowRight":
      return { kind: "move", day: addDays(focus, 1) };
    case "ArrowUp":
      return { kind: "move", day: clamp(addDays(focus, -7)) };
    case "ArrowDown":
      return { kind: "move", day: addDays(focus, 7) };
    case "Home":
      return { kind: "move", day: clamp(addDays(focus, -weekdayOf(focus))) };
    case "End":
      return { kind: "move", day: addDays(focus, 6 - weekdayOf(focus)) };
    case "PageUp":
      return { kind: "move", day: clamp(addMonths(focus, options.shift ? -12 : -1)) };
    case "PageDown":
      return { kind: "move", day: addMonths(focus, options.shift ? 12 : 1) };
    case "Enter":
    case " ":
      return options.min && focus < options.min ? null : { kind: "pick", day: focus };
    case "Escape":
      return { kind: "close" };
    default:
      return null;
  }
}
