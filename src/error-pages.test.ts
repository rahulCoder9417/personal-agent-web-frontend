import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../next.config";
import { CHAT_HREF, ErrorScreen, SUPPORT_HREF } from "./components/error-screen";
import GlobalError from "./app/global-error";
import ErrorPage from "./app/error";
import NotFound from "./app/not-found";

describe("error pages", () => {
  it("error.tsx shows a message, Try again, Go to chat and Email support", () => {
    const html = renderToStaticMarkup(h(ErrorPage, { error: new Error("x"), reset: vi.fn() }));
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).toContain(`href="${CHAT_HREF}"`);
    expect(html).toContain(`href="${SUPPORT_HREF}"`);
  });
  it("global-error.tsx brings its own html and a Try again button", () => {
    const html = renderToStaticMarkup(h(GlobalError, { error: new Error("x"), reset: vi.fn() }));
    expect(html).toContain("Try again");
    expect(html).toContain("Go to chat");
  });
  it("not-found.tsx has no Try again but links to chat and support", () => {
    const html = renderToStaticMarkup(h(NotFound));
    expect(html).toContain("Page not found");
    expect(html).not.toContain("Try again");
    expect(html).toContain("Go to chat");
    expect(html).toContain("Email support");
  });
  it("the chat link lands on a real page", () => {
    expect(CHAT_HREF).toBe("/");
    expect(existsSync(join(__dirname, "app/(app)/page.tsx"))).toBe(true);
    expect(SUPPORT_HREF.startsWith("mailto:")).toBe(true);
    expect(renderToStaticMarkup(h(ErrorScreen, { title: "t", message: "m" }))).not.toContain("Try again");
  });
});

describe("anti-framing headers", () => {
  it("are sent on every path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[0].headers).toEqual(SECURITY_HEADERS);
    const map = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
  });
});
