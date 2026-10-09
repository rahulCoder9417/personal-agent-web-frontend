import { beforeEach, describe, expect, it, vi } from "vitest";

// sonner draws the toasts; these tests check what this app hands it.
const sonner = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner, Toaster: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { ApiError } from "@/lib/api/client";
import { errorDetail, toast, TOAST_ERROR_MS, TOAST_MS, toastButton, toastError } from "./toast";

beforeEach(() => {
  sonner.success.mockClear();
  sonner.error.mockClear();
});

describe("toast", () => {
  it("shows a confirmation with its title and body", () => {
    toast({ title: "Gmail connected", body: "Tex can use it from now on." });
    expect(sonner.success).toHaveBeenCalledWith("Gmail connected", {
      description: "Tex can use it from now on.",
      duration: TOAST_MS,
      action: undefined,
    });
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("works with a title alone, as the callers that predate sonner use it", () => {
    toast({ title: "Saved" });
    expect(sonner.success).toHaveBeenCalledWith("Saved", expect.objectContaining({ description: undefined }));
  });

  it("passes a button through", () => {
    const action = { label: "Open", onClick: () => {} };
    toast({ title: "Done", action });
    expect(sonner.success).toHaveBeenCalledWith("Done", expect.objectContaining({ action }));
  });
});

describe("toastButton", () => {
  it("is nothing without an action", () => {
    expect(toastButton(undefined)).toBeUndefined();
  });

  it("opens a page of the app for a link", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const button = toastButton({ label: "See plans", href: "/settings/plans" });
    expect(button?.label).toBe("See plans");
    button?.onClick();
    expect(assign).toHaveBeenCalledWith("/settings/plans");
    vi.unstubAllGlobals();
  });
});

describe("toastError", () => {
  it("shows what failed and the API's own words for why", () => {
    toastError("Couldn’t connect Google Calendar", new ApiError(404, "not_found", "Google Calendar isn't configured yet"));
    expect(sonner.error).toHaveBeenCalledWith("Couldn’t connect Google Calendar", {
      id: "error:Couldn’t connect Google Calendar",
      description: "Google Calendar isn't configured yet",
      duration: TOAST_ERROR_MS,
      action: undefined,
    });
    expect(sonner.success).not.toHaveBeenCalled();
  });

  it("takes a sentence written for the case as it is", () => {
    toastError("Couldn’t start a new chat", "Too many new chats in the last hour.");
    expect(sonner.error).toHaveBeenCalledWith("Couldn’t start a new chat", expect.objectContaining({ description: "Too many new chats in the last hour." }));
  });

  it("gives the same failure the same id, so a second try replaces the toast instead of piling up", () => {
    toastError("Couldn’t delete it", new Error("first"));
    toastError("Couldn’t delete it", new Error("second"));
    const ids = sonner.error.mock.calls.map(([, options]) => options.id);
    expect(ids).toEqual(["error:Couldn’t delete it", "error:Couldn’t delete it"]);
  });

  it("stays longer than a confirmation, and carries the way out", () => {
    toastError("Your plan’s app limit is reached", "Disconnect one or upgrade to add more.", { label: "See plans", href: "/settings/plans" });
    expect(TOAST_ERROR_MS).toBeGreaterThan(TOAST_MS);
    expect(sonner.error).toHaveBeenCalledWith(
      "Your plan’s app limit is reached",
      expect.objectContaining({ duration: TOAST_ERROR_MS, action: { label: "See plans", onClick: expect.any(Function) } }),
    );
  });
});

describe("errorDetail", () => {
  it("is nothing when there is nothing to say", () => {
    expect(errorDetail(undefined)).toBeUndefined();
    expect(errorDetail(null)).toBeUndefined();
    expect(errorDetail("")).toBeUndefined();
  });

  it("reads an error's message, and falls back to a plain sentence for anything else", () => {
    expect(errorDetail(new Error("The server is busy"))).toBe("The server is busy");
    expect(errorDetail({ odd: true })).toBe("Something went wrong. Try again.");
    expect(errorDetail("As written")).toBe("As written");
  });
});
