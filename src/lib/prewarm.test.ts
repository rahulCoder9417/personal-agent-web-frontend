import { describe, expect, it } from "vitest";
import { createPrewarm, PREWARM_EVERY_MS, startsTyping } from "./prewarm";

describe("createPrewarm", () => {
  it("asks at once, then at most once a minute", () => {
    let now = 1_000_000;
    let sent = 0;
    const prewarm = createPrewarm(async () => void sent++, () => now);
    expect(prewarm()).toBe(true);
    expect(prewarm()).toBe(false);
    now += PREWARM_EVERY_MS - 1;
    expect(prewarm()).toBe(false);
    now += 1;
    expect(prewarm()).toBe(true);
    expect(sent).toBe(2);
    expect(PREWARM_EVERY_MS).toBe(60_000);
  });

  it("never fails, whether the request is refused or can't be made", async () => {
    const refused = createPrewarm(() => Promise.reject(new Error("503")));
    expect(refused()).toBe(true);
    const broken = createPrewarm(() => {
      throw new Error("offline");
    });
    expect(broken()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("startsTyping", () => {
  it("is the first character in an empty box, not every keystroke", () => {
    expect(startsTyping("", "h")).toBe(true);
    expect(startsTyping("  ", "  h")).toBe(true);
    expect(startsTyping("h", "he")).toBe(false);
    expect(startsTyping("", " ")).toBe(false);
    expect(startsTyping("hello", "")).toBe(false);
  });
});
