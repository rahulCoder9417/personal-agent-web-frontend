// The two ways the web app sends someone to another site.

/**
 * Leaves for another site in this tab: Polar's checkout, a provider's sign-in screen.
 * Both send the browser back to the app when they are done.
 */
export function leaveTo(url: string) {
  window.location.assign(url);
}

/**
 * Opens another site beside the app, for flows that need the app to stay where it is
 * (Anthropic's sign-in page, whose code is pasted back here; a chat app's deep link).
 */
export function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
