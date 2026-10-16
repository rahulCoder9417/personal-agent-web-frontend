// The address pull-request review had, before it joined the Automations list.
// No imports at run time: next.config.ts reads the redirect from here when the app is built, as it
// reads src/lib/integrations.ts.

/** Where a new pull-request review starts: its canvas, to pick the repo. */
export const PR_REVIEW_NEW_PATH = "/automations/new?template=pr-review";

/**
 * Pull-request review had a tab of its own (`/automations/reviews`); each reviewed repo is now a
 * row of the one list, and a new one starts from the "Review pull requests" template. The old
 * address leads to the list.
 */
export const OLD_AUTOMATION_ADDRESSES = [{ source: "/automations/reviews", destination: "/automations", permanent: false }] as const;
