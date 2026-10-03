import { describe, expect, it } from "vitest";
import { channelsToShow, linkableChannels, listNames } from "./channels";

describe("linkableChannels", () => {
  it("offers what the backend has switched on, in its order, without the web chat", () => {
    expect(linkableChannels(["telegram", "web"])).toEqual(["telegram"]);
    expect(linkableChannels(["web", "imessage", "whatsapp"])).toEqual(["imessage", "whatsapp"]);
  });

  it("offers nothing when only the web chat is on", () => {
    expect(linkableChannels(["web"])).toEqual([]);
    expect(linkableChannels([])).toEqual([]);
  });
});

describe("channelsToShow", () => {
  it("keeps a switched-off channel that still has history or a linked chat", () => {
    expect(channelsToShow(["telegram", "web"], ["whatsapp", "telegram", "whatsapp"])).toEqual(["telegram", "web", "whatsapp"]);
  });

  it("is just the available channels when nothing else has been seen", () => {
    expect(channelsToShow(["telegram", "web"], [])).toEqual(["telegram", "web"]);
  });
});

describe("listNames", () => {
  it("reads like a sentence for one, two or three names", () => {
    expect(listNames(["Telegram"])).toBe("Telegram");
    expect(listNames(["WhatsApp", "Telegram"])).toBe("WhatsApp or Telegram");
    expect(listNames(["WhatsApp", "Telegram", "iMessage"])).toBe("WhatsApp, Telegram or iMessage");
    expect(listNames(["Anthropic", "OpenAI"], "and")).toBe("Anthropic and OpenAI");
    expect(listNames([])).toBe("");
  });
});
