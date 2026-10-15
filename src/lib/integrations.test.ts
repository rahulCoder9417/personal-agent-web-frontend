import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { connectedReturnPath, INTEGRATIONS_APPS_PATH, INTEGRATIONS_MCP_PATH, INTEGRATIONS_PATH, linkChatHref, linkRequested, OLD_ADDRESSES } from "./integrations";

const params = (query: string) => new URLSearchParams(query);

describe("the addresses of Integrations", () => {
  it("has the chat apps first, then the apps and the MCP servers", () => {
    expect([INTEGRATIONS_PATH, INTEGRATIONS_APPS_PATH, INTEGRATIONS_MCP_PATH]).toEqual(["/integrations", "/integrations/apps", "/integrations/mcp"]);
  });

  it("links a chat app on the chat apps tab, with its linking panel, never in the welcome flow", () => {
    expect(linkChatHref("telegram")).toBe("/integrations?link=telegram");
    expect(linkChatHref(null)).toBe("/integrations");
    expect(linkChatHref()).toBe("/integrations");
    expect(linkChatHref("telegram")).not.toContain("onboarding");
  });

  it("brings an app's sign-in back to the Apps tab", () => {
    expect(connectedReturnPath("gmail")).toBe("/integrations/apps?connected=gmail");
    expect(connectedReturnPath("a b")).toBe("/integrations/apps?connected=a%20b");
  });

  it("opens the linking panel only for a chat app that can be linked here", () => {
    expect(linkRequested(params("link=telegram"), ["telegram"])).toBe("telegram");
    expect(linkRequested(params("link=Telegram"), ["telegram"])).toBe("telegram");
    expect(linkRequested(params("link=whatsapp"), ["telegram"])).toBeNull();
    expect(linkRequested(params("link=web"), ["telegram"])).toBeNull();
    expect(linkRequested(params(""), ["telegram"])).toBeNull();
  });
});

describe("the old addresses", () => {
  it("send /apps and /apps/mcp to their tabs, for now only (307)", () => {
    expect(OLD_ADDRESSES).toEqual([
      { source: "/apps", destination: "/integrations/apps", permanent: false },
      { source: "/apps/mcp", destination: "/integrations/mcp", permanent: false },
    ]);
  });

  it("are what the app's config redirects, so /apps?connected=gmail keeps its query on the way", async () => {
    // Next.js passes the query on to the destination of a redirect by itself.
    expect(await nextConfig.redirects?.()).toEqual(OLD_ADDRESSES.map((redirect) => ({ ...redirect })));
  });
});
