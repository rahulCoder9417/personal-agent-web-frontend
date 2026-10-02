import type { AgentStatus } from "./api/client";
import type { Mood } from "@/components/tex";

type State = AgentStatus["state"];

/** How Tex's state reads in the title bar, the tray and the chat panel. */
export function describeAgent(state: State | undefined, pendingApprovals = 0): { title: string; mood: Mood; live: boolean } {
  if (pendingApprovals > 0 && state !== "busy" && state !== "broken") {
    return { title: "Waiting for your OK", mood: "asking", live: true };
  }
  switch (state) {
    case "busy":
      return { title: "Tex is working", mood: "working", live: true };
    case "awake":
      return { title: "Tex is awake", mood: "ready", live: true };
    case "waking":
      return { title: "Tex is waking up", mood: "working", live: true };
    case "stopped":
      return { title: "Tex is asleep", mood: "asleep", live: false };
    case "broken":
      return { title: "Tex needs attention", mood: "paused", live: false };
    case "none":
      return { title: "Tex isn’t set up yet", mood: "paused", live: false };
    default:
      return { title: "Connecting", mood: "ready", live: false };
  }
}
