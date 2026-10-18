import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/api/hooks";

const toasts = vi.hoisted(() => ({ toast: vi.fn(), toastError: vi.fn() }));
vi.mock("../toast", () => toasts);

import { ContactSupport, copySupportAddress, SUPPORT_SUBJECT, supportMailto } from "./contact-support";

const draw = (me?: { id: string; email: string }) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  if (me) client.setQueryData(qk.me, me);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(ContactSupport)));
};

describe("the support card", () => {
  it("builds a mailto to support with the subject and the account in the message", () => {
    const url = new URL(supportMailto({ email: "a@b.co", id: "usr_1" }));
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("support@textcrew.in");
    expect(url.searchParams.get("subject")).toBe(SUPPORT_SUBJECT);
    const body = url.searchParams.get("body")!;
    for (const said of ["a@b.co", "usr_1", "What happened:"]) expect(body).toContain(said);
  });

  it("still works before the account is known", () => {
    const body = new URL(supportMailto()).searchParams.get("body")!;
    expect(body).toContain("What happened:");
    expect(body).not.toContain("User id");
  });

  it("shows Email support, Copy address and the reply time, with the account filled in", () => {
    const html = draw({ id: "usr_9", email: "me@x.io" });
    expect(html).toContain(">Email support</a>");
    expect(html).toContain(">Copy address</button>");
    expect(html).toContain("We usually reply within a day.");
    expect(html).toContain("usr_9");
    expect(html).toContain("me%40x.io");
  });
});

describe("Copy address", () => {
  beforeEach(() => {
    toasts.toast.mockClear();
    toasts.toastError.mockClear();
  });

  it("copies the address and says so in a toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copySupportAddress();
    expect(writeText).toHaveBeenCalledWith("support@textcrew.in");
    expect(toasts.toast).toHaveBeenCalledWith({ title: "Address copied" });
    vi.unstubAllGlobals();
  });

  it("tells the person by toast, not red text on the page, when the browser refuses", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    await copySupportAddress();
    expect(toasts.toastError).toHaveBeenCalled();
    expect(toasts.toast).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
