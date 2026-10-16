// Where plans, top-ups and the current subscription live: the Pricing screen, and the address it
// had before it moved out of Settings.
// No imports at run time: next.config.ts reads the old address's redirect from here when the app
// is built, as it reads src/lib/integrations.ts.

/** The Pricing screen: your plan, every plan, top-ups and how credits work. */
export const PRICING_PATH = "/pricing";

/** The Help topic on credits and plans, which says the rest. */
export const CREDITS_HELP_PATH = "/help#credits";

/**
 * Plans used to be Settings → Plans. Tex's messages, toasts in builds still open in a tab, and
 * bookmarks use that address, so it leads to Pricing, with the query as it was
 * (`/settings/plans?checkout=done`). Temporary (307), so a browser doesn't keep it for good.
 */
export const OLD_PRICING_ADDRESSES = [{ source: "/settings/plans", destination: PRICING_PATH, permanent: false }] as const;
