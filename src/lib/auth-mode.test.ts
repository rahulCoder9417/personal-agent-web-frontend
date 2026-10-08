import { afterEach, describe, expect, it, vi } from "vitest";
import { builtAuthMode, decideAuthMode, devTokenFrom, parseAuthMode } from "./auth-mode";

const KEYS = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", CLERK_SECRET_KEY: "sk_test_x" };

describe("decideAuthMode", () => {
  it("is demo mode when nothing is set", () => {
    expect(decideAuthMode({})).toBe("demo");
    expect(decideAuthMode({ NODE_ENV: "production" })).toBe("demo");
  });

  it("signs in with Clerk when both keys are set, and only then", () => {
    expect(decideAuthMode(KEYS)).toBe("clerk");
    expect(decideAuthMode({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" })).toBe("demo");
    expect(decideAuthMode({ CLERK_SECRET_KEY: "sk_test_x" })).toBe("demo");
  });

  it("is demo mode when asked for, keys or not", () => {
    expect(decideAuthMode({ ...KEYS, TEXTCREW_DEMO: "1" })).toBe("demo");
  });

  it("uses the development token in development only", () => {
    expect(decideAuthMode({ ...KEYS, TEXTCREW_DEV_TOKEN: "dev-jwt", NODE_ENV: "development" })).toBe("dev-token");
    expect(decideAuthMode({ TEXTCREW_DEV_TOKEN: "dev-jwt", NODE_ENV: "production" })).toBe("demo");
    expect(decideAuthMode({ ...KEYS, TEXTCREW_DEV_TOKEN: "dev-jwt", NODE_ENV: "production" })).toBe("clerk");
    expect(devTokenFrom({ TEXTCREW_DEV_TOKEN: "  dev-jwt  " })).toBe("dev-jwt");
    expect(devTokenFrom({ TEXTCREW_DEV_TOKEN: "  " })).toBeNull();
  });
});

describe("builtAuthMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is the mode next.config.ts wrote in when the app was built, whatever the environment says now", () => {
    vi.stubEnv("NEXT_PUBLIC_TEXTCREW_AUTH_MODE", "clerk");
    vi.stubEnv("TEXTCREW_DEMO", "1");
    expect(builtAuthMode()).toBe("clerk");
    vi.stubEnv("NEXT_PUBLIC_TEXTCREW_AUTH_MODE", "demo");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    expect(builtAuthMode()).toBe("demo");
  });

  it("is worked out from the environment where nothing was written in", () => {
    vi.stubEnv("NEXT_PUBLIC_TEXTCREW_AUTH_MODE", undefined);
    vi.stubEnv("TEXTCREW_DEMO", undefined);
    vi.stubEnv("TEXTCREW_DEV_TOKEN", undefined);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    expect(builtAuthMode()).toBe("clerk");
    vi.stubEnv("CLERK_SECRET_KEY", undefined);
    expect(builtAuthMode()).toBe("demo");
  });

  it("only takes a mode it knows", () => {
    expect(parseAuthMode("clerk")).toBe("clerk");
    expect(parseAuthMode("dev-token")).toBe("dev-token");
    expect(parseAuthMode("Clerk")).toBeNull();
    expect(parseAuthMode(undefined)).toBeNull();
  });
});
