import { describe, expect, it } from "vitest";
import { resolveUpstream } from "./proxy-target";

const BASE = "http://localhost:8080";

describe("resolveUpstream", () => {
  it("maps an allowed path onto the backend's /v1", () => {
    expect(resolveUpstream(BASE, ["me"])?.toString()).toBe("http://localhost:8080/v1/me");
    expect(resolveUpstream(`${BASE}/`, ["approvals", "ap_1", "decision"])?.toString()).toBe(
      "http://localhost:8080/v1/approvals/ap_1/decision",
    );
  });

  it("keeps the query string but drops a client-supplied token", () => {
    const url = resolveUpstream(BASE, ["messages"], "?limit=30&token=stolen&channel=web");
    expect(url?.searchParams.get("limit")).toBe("30");
    expect(url?.searchParams.get("channel")).toBe("web");
    expect(url?.searchParams.has("token")).toBe(false);
  });

  it("refuses admin, waitlist and webhook paths", () => {
    expect(resolveUpstream(BASE, ["admin", "coupons"])).toBeNull();
    expect(resolveUpstream(BASE, ["waitlist"])).toBeNull();
    expect(resolveUpstream(BASE, ["webhooks", "polar"])).toBeNull();
  });

  it("refuses empty paths and traversal", () => {
    expect(resolveUpstream(BASE, [])).toBeNull();
    expect(resolveUpstream(BASE, ["me", ".."])).toBeNull();
    expect(resolveUpstream(BASE, ["me", "a/b"])).toBeNull();
    expect(resolveUpstream(BASE, ["me", ""])).toBeNull();
  });

  it("encodes segments so they can't change the path", () => {
    expect(resolveUpstream(BASE, ["apps", "g mail"])).toBeNull();
    expect(resolveUpstream(BASE, ["apps", "gmail%2F..", "connect"])?.pathname).toBe("/v1/apps/gmail%252F../connect");
  });
});
