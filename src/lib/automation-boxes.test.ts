import { describe, expect, it } from "vitest";
import { conditionPill, stepLine, triggerText } from "./automation-boxes";
import { emptyEditor, previewSource, type EditorParts } from "./automation-editor";

const NOW = new Date("2026-10-01T14:30:00");
const editor = (over: Partial<EditorParts>): EditorParts => ({ ...emptyEditor("Asia/Kolkata", NOW), ...over });
const text = (parts: EditorParts, zone = "Asia/Kolkata") => triggerText(previewSource(parts), parts.mode, zone, NOW);

describe("the trigger's box", () => {
  it("asks for a trigger while none is picked", () => {
    expect(text(editor({}))).toEqual({ logo: "schedule", label: "Start when", title: "Pick when it runs", line: "Once, on a schedule or on an app event" });
  });

  it("names a schedule by its days and time, with whose clock it is", () => {
    const daily = editor({ mode: "schedule", schedule: { kind: "days", days: [0, 1, 2, 3, 4, 5, 6], time: "09:00", hours: 4, cron: "" } });
    expect(text(daily)).toEqual({ logo: "schedule", label: "Schedule", title: "Every day at 9:00 AM", line: "Your time, Asia/Kolkata" });
    expect(text(daily, "Europe/London").line).toBe("Kolkata time, Asia/Kolkata");
  });

  it("names a moment, and an app event by what happens and what the app watches", () => {
    expect(text(editor({ mode: "once", date: "2026-10-02", time: "10:00" })).title).toBe("Tomorrow at 10:00 AM");
    const email = editor({ mode: "event", event: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: {} } });
    expect(text(email)).toEqual({ logo: "gmail", label: "Gmail", title: "A new email arrives", line: "Each time it happens" });
    const pr = editor({ mode: "event", event: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT", config: { owner: "acme", repo: "web" } } });
    expect(text(pr)).toEqual({ logo: "github", label: "GitHub", title: "A pull request opens or gets new commits", line: "Repository: acme/web" });
    expect(text(editor({ mode: "event" })).title).toBe("Pick an app and what happens");
    expect(text(editor({ mode: "event", event: { app: "gmail", event: "", config: {} } })).title).toBe("Pick what happens");
  });
});

describe("a step's line", () => {
  const step = { type: "action" as const, title: "Fetch emails", inputs: {}, instruction: null, readApps: [] };
  it("says an app step's first fixed input, else what its action does", () => {
    expect(stepLine({ ...step, inputs: { query: "is:unread" } })).toBe("query: is:unread");
    expect(stepLine(step, "Emails matching a search.")).toBe("Emails matching a search.");
    expect(stepLine(step)).toBeNull();
  });

  it("says a Tex step's instruction when its box has its own name, else the apps it reads", () => {
    const tex = { type: "tex" as const, inputs: {}, readApps: ["gmail"] };
    expect(stepLine({ ...tex, title: "Check if it’s urgent", instruction: "Read the email and say whether it needs me today." })).toBe("Read the email and say whether it needs me today.");
    expect(stepLine({ ...tex, title: "Read the email and say…", instruction: "Read the email and say whether it needs me today." })).toBe("Reads Gmail");
  });
});

describe("the 'only if' pill", () => {
  it("says what the condition checks, and nothing on step 1", () => {
    expect(conditionPill({ kind: "found" }, 1)).toBe("Only if the step before found something");
    expect(conditionPill({ kind: "mentions", words: ["urgent", "asap", "now"] }, 2)).toBe("Only if it mentions “urgent” or “asap” +1");
    expect(conditionPill({ kind: "tex", question: "Is it urgent?" }, 1)).toBe("Only if Tex says yes");
    expect(conditionPill({ kind: "always" }, 1)).toBeNull();
    expect(conditionPill({ kind: "found" }, 0)).toBeNull();
  });
});
