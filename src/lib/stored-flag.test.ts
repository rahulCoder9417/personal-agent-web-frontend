import { afterEach, describe, expect, it, vi } from "vitest";
import { storedFlag } from "./stored-flag";

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const blocked = () => {
  throw new Error("storage is blocked");
};

afterEach(() => vi.unstubAllGlobals());

describe("storedFlag", () => {
  it("is no on the server and until something was stored", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    const flag = storedFlag("chats.hidden");
    expect(flag.getServerSnapshot()).toBe(false);
    expect(flag.getSnapshot()).toBe(false);
  });

  it("reads what an earlier visit stored, keeps a change, and tells whoever is listening", () => {
    const storage = fakeStorage({ "chats.hidden": "1" });
    vi.stubGlobal("window", { localStorage: storage });
    const flag = storedFlag("chats.hidden");
    expect(flag.getSnapshot()).toBe(true);

    const changed = vi.fn();
    const stop = flag.subscribe(changed);
    flag.set(false);
    expect(flag.getSnapshot()).toBe(false);
    expect(storage.items.has("chats.hidden")).toBe(false);
    flag.set(true);
    expect(storage.items.get("chats.hidden")).toBe("1");
    expect(changed).toHaveBeenCalledTimes(2);

    stop();
    flag.set(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("still works for the open page where storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { getItem: blocked, setItem: blocked, removeItem: blocked } });
    const flag = storedFlag("chats.hidden");
    expect(flag.getSnapshot()).toBe(false);
    flag.set(true);
    expect(flag.getSnapshot()).toBe(true);
  });
});
