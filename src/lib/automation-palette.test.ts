import { describe, expect, it } from "vitest";
import type { AppAction, AppEvent } from "./api/client";
import { emptyEditor } from "./automation-editor";
import { blockMatches, blockStep, isTriggerBlock, paletteBlocks, paletteGroups, withTriggerBlock, type PaletteBlock } from "./automation-palette";

const action = (slug: string, name: string, changesSomething: boolean, requiresApproval = false): AppAction => ({
  slug,
  name,
  description: `${name}, as the app says.`,
  changesSomething,
  requiresApproval,
  inputs: [],
});
const event = (slug: string, name: string): AppEvent => ({ slug, name, description: name, settings: [] });

const apps = [
  { slug: "gmail", name: "Gmail" },
  { slug: "github", name: "GitHub" },
];
const events = new Map([
  ["gmail", [event("GMAIL_NEW_GMAIL_MESSAGE", "New email")]],
  ["github", [event("GITHUB_PULL_REQUEST_EVENT", "Pull request"), event("GITHUB_COMMIT_EVENT", "New commit")]],
]);
const actions = new Map([
  [
    "gmail",
    [
      action("GMAIL_ADD_LABEL_TO_EMAIL", "Add a label", true),
      action("GMAIL_FETCH_EMAILS", "Fetch emails", false),
      action("GMAIL_SEND_EMAIL", "Send email", true, true),
      action("GMAIL_GET_PROFILE", "Profile", false),
    ],
  ],
  ["github", [action("GITHUB_LIST_PULL_REQUESTS", "List pull requests", false), action("GITHUB_CREATE_AN_ISSUE", "Create an issue", true)]],
]);

const blocks = paletteBlocks(apps, events, actions);
const keysOf = (list: readonly PaletteBlock[]) => list.map((block) => block.key);

describe("the blocks", () => {
  it("come from the apps' real events and actions: reading actions read, the others write", () => {
    const byGroup = (group: string) => keysOf(blocks.filter((block) => block.group === group));
    expect(byGroup("start")).toEqual(["once", "schedule", "event:gmail:GMAIL_NEW_GMAIL_MESSAGE", "event:github:GITHUB_PULL_REQUEST_EVENT", "event:github:GITHUB_COMMIT_EVENT"]);
    // The ones people reach for first ("Fetch", "Send") lead their app.
    expect(byGroup("read")).toEqual(["action:gmail:GMAIL_FETCH_EMAILS", "action:gmail:GMAIL_GET_PROFILE", "action:github:GITHUB_LIST_PULL_REQUESTS"]);
    expect(byGroup("tex")).toEqual(["tex"]);
    expect(byGroup("write")).toEqual(["action:gmail:GMAIL_SEND_EMAIL", "action:gmail:GMAIL_ADD_LABEL_TO_EMAIL", "action:github:GITHUB_CREATE_AN_ISSUE"]);
  });

  it("an app whose list hasn't loaded has none yet", () => {
    const some = paletteBlocks([{ slug: "notion", name: "Notion" }], new Map(), new Map());
    expect(keysOf(some)).toEqual(["once", "schedule", "tex"]);
  });
});

describe("the groups", () => {
  it("are Start when, Read, Tex and Write, reading and writing optional", () => {
    const groups = paletteGroups(blocks, "");
    expect(groups.map((group) => [group.title, group.optional])).toEqual([
      ["Start when", false],
      ["Read from an app", true],
      ["Tex and the crew", false],
      ["Write or send", true],
    ]);
  });

  it("show a few blocks per app until something is typed, and say how many more there are", () => {
    const groups = paletteGroups(blocks, "", { perApp: 1 });
    const read = groups.find((group) => group.group === "read")!;
    expect(keysOf(read.blocks)).toEqual(["action:gmail:GMAIL_FETCH_EMAILS", "action:github:GITHUB_LIST_PULL_REQUESTS"]);
    expect(read.hidden).toBe(1);
    // Once and on a schedule are always there.
    expect(keysOf(groups[0].blocks).slice(0, 2)).toEqual(["once", "schedule"]);
  });

  it("search every word in the name, the app and what it does, dropping empty groups", () => {
    const groups = paletteGroups(blocks, "github pull", { perApp: 1 });
    expect(groups.map((group) => group.group)).toEqual(["start", "read"]);
    expect(keysOf(groups.flatMap((group) => group.blocks))).toEqual(["event:github:GITHUB_PULL_REQUEST_EVENT", "action:github:GITHUB_LIST_PULL_REQUESTS"]);
    expect(blockMatches(blocks.find((block) => block.key === "tex")!, "sum up")).toBe(true);
  });

  it("keep only the lanes a '+' can take", () => {
    const groups = paletteGroups(blocks, "", { only: new Set(["tex", "write"] as const) });
    expect(groups.map((group) => group.group)).toEqual(["tex", "write"]);
  });
});

describe("what a block puts on the canvas", () => {
  it("an action is a step in its lane, asking first when it sends, deletes or pays", () => {
    const send = blocks.find((block) => block.key === "action:gmail:GMAIL_SEND_EMAIL")!;
    expect(blockStep(send, "s1")).toMatchObject({ id: "s1", type: "action", app: "gmail", action: "GMAIL_SEND_EMAIL", risky: true, askFirst: true, lane: "write" });
    const fetch = blocks.find((block) => block.key === "action:gmail:GMAIL_FETCH_EMAILS")!;
    expect(blockStep(fetch, "s2")).toMatchObject({ type: "action", risky: false, askFirst: false, lane: "read" });
    expect(blockStep(blocks.find((block) => block.key === "tex")!, "s3")).toMatchObject({ type: "tex", showResult: true });
    expect(blockStep(blocks[0], "s4")).toBeNull();
  });

  it("a trigger block replaces the trigger", () => {
    const editor = emptyEditor("UTC");
    expect(isTriggerBlock(blocks[0])).toBe(true);
    expect(withTriggerBlock(editor, blocks[0]).mode).toBe("once");
    expect(withTriggerBlock(editor, blocks[1]).mode).toBe("schedule");
    const pr = withTriggerBlock(editor, blocks.find((block) => block.key === "event:github:GITHUB_PULL_REQUEST_EVENT")!);
    expect(pr).toMatchObject({ mode: "event", event: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT", config: {} } });
    // The same event again keeps its settings.
    const set = { ...pr, event: { ...pr.event, config: { owner: "acme" } } };
    expect(withTriggerBlock(set, blocks.find((block) => block.key === "event:github:GITHUB_PULL_REQUEST_EVENT")!).event.config).toEqual({ owner: "acme" });
  });
});
