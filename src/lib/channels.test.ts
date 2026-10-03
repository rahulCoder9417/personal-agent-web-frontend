import { describe, expect, it } from "vitest";
import { channelsToShow, linkableChannels } from "./channels";

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
