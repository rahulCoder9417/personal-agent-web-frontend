import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api/client";
import { freshSession, RENEW_WAIT_MS, setRenewer } from "./fresh-session";

// 17 October, 05:10:39: the founder's message and the wake-up that goes with it were refused with
// 401, "Sign in to continue", while a GET of the same moment went through. The sign-in token in the
// cookie had run out (it lasts 60 seconds); Clerk renews it on the server for a GET, never for a
// POST. Now each call asks Clerk's script in the page for a good token first.

afterEach(() => {
  setRenewer(null);
  vi.useRealTimers();
});

describe("a good token before each call", () => {
  it("costs nothing where there is no sign-in (demo, a local token)", async () => {
    await expect(freshSession()).resolves.toBeUndefined();
  });

  it("waits for the renewal, and calls at the same moment share one", async () => {
    let renewals = 0;
    let done!: () => void;
    setRenewer(() => {
      renewals++;
      return new Promise<void>((resolve) => (done = resolve));
    });
    const order: string[] = [];
    const calls = [freshSession().then(() => order.push("a")), freshSession().then(() => order.push("b"))];
    await Promise.resolve();
    expect(order).toEqual([]);
    done();
    await Promise.all(calls);
    expect(renewals).toBe(1);
    expect(order).toEqual(["a", "b"]);
    // The next call asks again (Clerk's script answers at once while the token is good).
    const next = freshSession();
    await Promise.resolve();
    done();
    await next;
    expect(renewals).toBe(2);
  });

  it("never holds a call for long, and never fails it", async () => {
    vi.useFakeTimers();
    setRenewer(() => new Promise(() => {}));
    let went = false;
    void freshSession().then(() => (went = true));
    await vi.advanceTimersByTimeAsync(RENEW_WAIT_MS - 1);
    expect(went).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(went).toBe(true);

    setRenewer(async () => {
      throw new Error("offline");
    });
    await expect(freshSession()).resolves.toBeUndefined();
  });

  it("is done before the API's request leaves the page", async () => {
    const order: string[] = [];
    setRenewer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("renewed");
    });
    const fetch = async (request: Request) => {
      order.push(`${request.method} ${new URL(request.url).pathname}`);
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 202, headers: { "content-type": "application/json" } });
    };
    await api.POST("/v1/messages", { baseUrl: "http://localhost/api", fetch, body: { text: "hi", clientMessageId: "4b0e8f0a-2a43-4c1f-9d55-0e7f1c1b9a01" } });
    expect(order).toEqual(["renewed", "POST /api/v1/messages"]);
  });
});
