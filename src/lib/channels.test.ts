import { describe, expect, it } from "vitest";
import { blockedTheBot, channelsToShow, lastMessageLine, linkableChannels, maskedChatIdToShow } from "./channels";

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

describe("what a linked chat says about itself", () => {
  const now = new Date("2026-10-15T14:30:00");

  it("shows the masked chat id when it adds to the name, never twice", () => {
    expect(maskedChatIdToShow({ displayId: "@aarav_s", maskedChatId: "•••• 4821" })).toBe("•••• 4821");
    // A WhatsApp chat is shown as its masked number already.
    expect(maskedChatIdToShow({ displayId: "+91 •••• ••42 10", maskedChatId: "+91 •••• ••42 10" })).toBeNull();
    // A backend from before the field.
    expect(maskedChatIdToShow({ displayId: "@aarav_s" })).toBeNull();
    expect(maskedChatIdToShow({ displayId: "@aarav_s", maskedChatId: " " })).toBeNull();
  });

  it("says when the chat last wrote, and nothing when the backend doesn't say", () => {
    expect(lastMessageLine({ lastInboundAt: "2026-10-15T12:25:00" }, now)).toBe("Last message 2h ago");
    expect(lastMessageLine({ lastInboundAt: "2026-10-15T14:13:00" }, now)).toBe("Last message 17 min ago");
    expect(lastMessageLine({ lastInboundAt: "2026-10-15T14:29:40" }, now)).toBe("Last message just now");
    expect(lastMessageLine({ lastInboundAt: "2026-10-14T20:00:00" }, now)).toBe("Last message yesterday");
    expect(lastMessageLine({ lastInboundAt: "2026-09-12T09:00:00" }, now)).toBe("Last message 12 Sep");
    expect(lastMessageLine({ lastInboundAt: null }, now)).toBeNull();
    expect(lastMessageLine({}, now)).toBeNull();
  });

  it("is blocked only when the backend says so", () => {
    expect(blockedTheBot({ blocked: true })).toBe(true);
    expect(blockedTheBot({ blocked: false })).toBe(false);
    expect(blockedTheBot({})).toBe(false);
  });
});
