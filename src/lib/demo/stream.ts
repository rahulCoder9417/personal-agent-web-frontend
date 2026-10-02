// GET /v1/stream for the demo account: the same Server-Sent Events framing the backend uses.

import type { StreamEvent } from "@/lib/api/client";
import { subscribe, type DemoState } from "./store";

const PING_MS = 25_000;

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function streamResponse(request: Request, state: DemoState): Response {
  const encoder = new TextEncoder();
  let stop = () => {};

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (open) controller.enqueue(encoder.encode(frame(event, data)));
      };
      const unsubscribe = subscribe(state, (event: StreamEvent) => send(event.type, event));
      const ping = setInterval(() => send("ping", {}), PING_MS);

      stop = () => {
        if (!open) return;
        open = false;
        unsubscribe();
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          // Already closed by the reader going away.
        }
      };
      request.signal.addEventListener("abort", stop, { once: true });
      send("ready", {});
    },
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
