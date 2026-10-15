import { afterEach, describe, expect, it, vi } from "vitest";
import { accountHere, clerkUserIdFromCookies, COVER_HINT_ATTRIBUTE, coverHintScript, onboardedHere, ONBOARDED_PREFIX, rememberOnboarded } from "./onboarded-here";

/** A session token as Clerk keeps it in `__session`: three base64url parts, the claims in the middle. */
function sessionToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.c2lnbmF0dXJl`;
}

/** localStorage, in memory, that can be told to refuse everything (a private window, blocked storage). */
function memoryStore(refuse = false) {
  const items = new Map<string, string>();
  const check = () => {
    if (refuse) throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return {
    items,
    getItem: (key: string) => (check(), items.get(key) ?? null),
    setItem: (key: string, value: string) => (check(), void items.set(key, value)),
    removeItem: (key: string) => (check(), void items.delete(key)),
    key: (index: number) => (check(), [...items.keys()][index] ?? null),
    get length() {
      check();
      return items.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("whose note it is", () => {
  it("is the Clerk user in the session cookie", () => {
    const cookies = `__client_uat=1792064982; __session=${sessionToken({ sub: "user_2Founder", sid: "sess_1" })}; theme=light`;
    expect(clerkUserIdFromCookies(cookies)).toBe("user_2Founder");
    expect(accountHere("clerk", cookies)).toBe("user_2Founder");
  });

  it("reads only the cookie named __session, not one that only starts like it", () => {
    const cookies = `__session_Ab12Cd34=${sessionToken({ sub: "user_old_instance" })}; __session=${sessionToken({ sub: "user_now" })}`;
    expect(clerkUserIdFromCookies(cookies)).toBe("user_now");
    expect(clerkUserIdFromCookies(`__session_Ab12Cd34=${sessionToken({ sub: "user_old_instance" })}`)).toBeNull();
  });

  it("is nobody when there is no session, or it can't be read: then the chat waits for the account", () => {
    expect(clerkUserIdFromCookies("")).toBeNull();
    expect(clerkUserIdFromCookies("__session=")).toBeNull();
    expect(clerkUserIdFromCookies("__session=not-a-token")).toBeNull();
    expect(clerkUserIdFromCookies("__session=a.%%%.c")).toBeNull();
    expect(clerkUserIdFromCookies(`__session=${sessionToken({ sid: "sess_1" })}`)).toBeNull();
    expect(clerkUserIdFromCookies(`__session=${sessionToken({ sub: 42 })}`)).toBeNull();
  });

  it("is the one account in demo and dev-token mode", () => {
    expect(accountHere("demo", "")).toBe("demo");
    expect(accountHere("dev-token", "")).toBe("dev-token");
  });
});

describe("the note", () => {
  it("is kept per account", () => {
    const store = memoryStore();
    onboardedHere.set("user_a", true, store);
    expect(store.items.get(`${ONBOARDED_PREFIX}user_a`)).toBe("1");
    expect(store.items.has("tc:onboarded:user_a")).toBe(true);
    expect(onboardedHere.has("user_a", store)).toBe(true);
    // Someone else signing in on this browser has no note.
    expect(onboardedHere.has("user_b", store)).toBe(false);
    expect(onboardedHere.has(null, store)).toBe(false);
  });

  it("is dropped when the account says the flow isn't done", () => {
    const store = memoryStore();
    onboardedHere.set("user_a", true, store);
    onboardedHere.set("user_a", false, store);
    expect(onboardedHere.has("user_a", store)).toBe(false);
  });

  it("goes for every account on sign-out, and nothing else does", () => {
    const store = memoryStore();
    onboardedHere.set("user_a", true, store);
    onboardedHere.set("user_b", true, store);
    store.setItem("textcrew.panels.chats", "1");
    onboardedHere.forgetAll(store);
    expect([...store.items.keys()]).toEqual(["textcrew.panels.chats"]);
  });

  it("never throws when storage is blocked: there is simply no note", () => {
    const store = memoryStore(true);
    expect(() => onboardedHere.set("user_a", true, store)).not.toThrow();
    expect(onboardedHere.has("user_a", store)).toBe(false);
    expect(() => onboardedHere.forgetAll(store)).not.toThrow();
    // No browser at all (the page drawn ahead).
    expect(onboardedHere.has("user_a")).toBe(false);
    expect(() => onboardedHere.set("user_a", true)).not.toThrow();
  });
});

describe("keeping the note in step with the account", () => {
  const signedIn = (sub: string) => {
    const store = memoryStore();
    vi.stubGlobal("document", { cookie: `__session=${sessionToken({ sub })}` });
    vi.stubGlobal("window", { localStorage: store });
    return store;
  };

  it("notes it once GET /v1/me says the flow was finished or skipped", () => {
    const store = signedIn("user_a");
    rememberOnboarded("clerk", "2026-10-15T12:12:38.000Z");
    expect(onboardedHere.has("user_a", store)).toBe(true);
  });

  it("drops it when the account says otherwise: shown again from Settings, or reset by an admin", () => {
    const store = signedIn("user_a");
    onboardedHere.set("user_a", true, store);
    rememberOnboarded("clerk", null);
    expect(onboardedHere.has("user_a", store)).toBe(false);
  });

  it("leaves it alone on a backend that doesn't send the mark", () => {
    const store = signedIn("user_a");
    onboardedHere.set("user_a", true, store);
    rememberOnboarded("clerk", undefined);
    expect(onboardedHere.has("user_a", store)).toBe(true);
  });

  it("writes nothing when nobody can be read from the cookie", () => {
    const store = memoryStore();
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("window", { localStorage: store });
    rememberOnboarded("clerk", "2026-10-15T12:12:38.000Z");
    expect(store.items.size).toBe(0);
  });
});

describe("the script that runs before the first paint", () => {
  /** Runs the script on a page with these cookies and this storage; says whether it set the hint. */
  function run(mode: "clerk" | "demo" | "dev-token", cookie: string, store: ReturnType<typeof memoryStore>): boolean {
    const attributes = new Set<string>();
    const document = { cookie, documentElement: { setAttribute: (name: string) => void attributes.add(name) } };
    new Function("document", "localStorage", "atob", coverHintScript(mode))(document, store, atob);
    return attributes.has(COVER_HINT_ATTRIBUTE);
  }
  const noted = (...accounts: string[]) => {
    const store = memoryStore();
    for (const account of accounts) onboardedHere.set(account, true, store);
    return store;
  };

  it("sets the hint when this browser has the note for the account in the session cookie", () => {
    expect(run("clerk", `a=1; __session=${sessionToken({ sub: "user_a" })}`, noted("user_a"))).toBe(true);
  });

  it("leaves it off for anyone else: a new account, or someone else signing in here", () => {
    expect(run("clerk", `__session=${sessionToken({ sub: "user_b" })}`, noted("user_a"))).toBe(false);
    expect(run("clerk", `__session=${sessionToken({ sub: "user_b" })}`, noted())).toBe(false);
    expect(run("clerk", `__session_Ab12Cd34=${sessionToken({ sub: "user_a" })}`, noted("user_a"))).toBe(false);
  });

  it("leaves it off, without an error, when it can't read the cookie or the storage", () => {
    expect(run("clerk", "", noted("user_a"))).toBe(false);
    expect(run("clerk", "__session=a.%%%.c", noted("user_a"))).toBe(false);
    expect(run("clerk", `__session=${sessionToken({ sub: "user_a" })}`, memoryStore(true))).toBe(false);
  });

  it("reads the one account's note in demo and dev-token mode", () => {
    expect(run("demo", "", noted("demo"))).toBe(true);
    expect(run("dev-token", "", noted("dev-token"))).toBe(true);
    expect(run("demo", "", noted())).toBe(false);
  });
});
