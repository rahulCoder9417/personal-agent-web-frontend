import { describe, expect, it } from "vitest";
import { chatDraftHref } from "./chat-link";

describe("chatDraftHref", () => {
  it("links to the chat with the request in ?draft=, which the composer reads once", () => {
    expect(chatDraftHref("Research what other tools charge")).toBe("/?draft=Research%20what%20other%20tools%20charge");
  });

  it("keeps punctuation and quotes intact through the address", () => {
    const text = "Remind me at 5pm: “send the report” & call Maya?";
    const href = chatDraftHref(text);
    expect(new URL(href, "https://app.example").searchParams.get("draft")).toBe(text);
  });

  it("drops the space around what was written", () => {
    expect(chatDraftHref("  hello  ")).toBe("/?draft=hello");
  });
});
