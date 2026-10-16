// What Tex tells the user on Telegram (Settings → General, "Tell me on Telegram when…"): four
// switches and quiet hours, kept by the backend on the account (`Me.notifications`). A notice on
// Telegram is always in addition to the chat the work was asked in, never instead of it. An
// approval asked in the web app stays there; one an automation asks goes to Telegram too while
// its switch is on.

import type { Me, MeUpdate } from "@/lib/api/client";

export type NotificationSettings = Me["notifications"];
export type NotificationSettingsUpdate = NonNullable<MeUpdate["notifications"]>;
export type NoticeSwitch = "crewJobs" | "prReviews" | "automationRuns" | "automationApprovals";

/** The settings every account starts with (the backend's defaults). */
export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  crewJobs: true,
  prReviews: true,
  automationRuns: false,
  automationApprovals: true,
  quietHours: { enabled: true, start: "22:00", end: "08:00" },
};

/** The anchor of the group on Settings → General, for links that lead to it. */
export const TELEGRAM_NOTICES_ID = "telegram-notices";

/** The four switches, in the order shown, with what each one sends. */
export const NOTICE_SWITCHES: readonly { key: NoticeSwitch; label: string; help: string }[] = [
  {
    key: "crewJobs",
    label: "Byte or Patch finishes a job",
    help: "A short line when Patch or Byte finishes a job you gave in the web app, with a link to the report.",
  },
  {
    key: "prReviews",
    label: "Pull-request reviews finish",
    help: "A copy of each review’s verdict.",
  },
  {
    key: "automationRuns",
    label: "Automation runs finish",
    help: "A copy of each answer of an automation made in the web app. The ones made on Telegram always answer there.",
  },
  {
    key: "automationApprovals",
    label: "An automation needs my OK",
    help: "Approve or Deny on Telegram when an automation asks; what you ask in the web app stays here.",
  },
];

/** The settings with a change applied: only the fields it names change. */
export function withNotificationChange(current: NotificationSettings, change: NotificationSettingsUpdate): NotificationSettings {
  return {
    crewJobs: change.crewJobs ?? current.crewJobs,
    prReviews: change.prReviews ?? current.prReviews,
    automationRuns: change.automationRuns ?? current.automationRuns,
    automationApprovals: change.automationApprovals ?? current.automationApprovals,
    quietHours: { ...current.quietHours, ...change.quietHours },
  };
}

/** "22:00" → "10:00 PM". */
export function clockLabel(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** The times offered for quiet hours: every half hour, and the saved one if it is between. */
export function clockOptions(saved: string): { value: string; label: string }[] {
  const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
  if (!times.includes(saved)) times.push(saved);
  return times.sort().map((value) => ({ value, label: clockLabel(value) }));
}

/** What a change says in its toast: "Automation runs finish: on", "Quiet hours: 10:00 PM to 8:00 AM". */
export function changeToast(change: NotificationSettingsUpdate, after: NotificationSettings): string {
  const named = NOTICE_SWITCHES.find(({ key }) => change[key] !== undefined);
  if (named) return `${named.label}: ${change[named.key] ? "on" : "off"}`;
  const quiet = after.quietHours;
  if (change.quietHours?.enabled === false) return "Quiet hours off";
  return `Quiet hours: ${clockLabel(quiet.start)} to ${clockLabel(quiet.end)}`;
}
