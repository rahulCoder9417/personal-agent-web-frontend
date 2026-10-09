import { describe, expect, it } from "vitest";
import { refusedTypedValue } from "./action-errors";
import { ApiError } from "./api/client";

describe("refusedTypedValue", () => {
  it("is the API's verdict on what was typed: a 400", () => {
    expect(refusedTypedValue(new ApiError(400, "invalid_request", "The provider rejected this key"))).toBe(true);
  });

  it("is not a plan limit, a missing connection, too many tries or a broken server: those are toasts", () => {
    for (const status of [401, 402, 403, 404, 409, 429, 500, 503]) {
      expect(refusedTypedValue(new ApiError(status, "other", "No"))).toBe(false);
    }
  });

  it("is not a dropped connection or nothing at all", () => {
    expect(refusedTypedValue(new TypeError("Failed to fetch"))).toBe(false);
    expect(refusedTypedValue(null)).toBe(false);
    expect(refusedTypedValue(undefined)).toBe(false);
  });
});
