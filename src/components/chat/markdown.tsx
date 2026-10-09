"use client";

import { createContext, memo, useContext, useEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/format";
import { codeLanguage, safeLink } from "@/lib/markdown";
import { CheckIcon, CopyIcon } from "../icons";

// Draws what Tex wrote as Markdown. Tex's text is not trusted: a page it read, or an email, can put
// words in its mouth. So nothing in it is ever treated as HTML, a link leads only to a web page or
// an email address (src/lib/markdown.ts), and a picture is never fetched.
//
// This file and its libraries are a chunk of their own, loaded by agent-bubble.tsx the first time
// a reply has something to draw. How it looks is in globals.css, under `.markdown`.

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };

/** Where HTML stands on lines of its own, as a block, and not inside a sentence. */
const BLOCK_PARENTS = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);

/**
 * Raw HTML in a reply is shown as the text it was typed as, never drawn. This turns each piece of
 * it into plain text before anything is drawn: a tag inside a sentence stays in the sentence, and
 * HTML on lines of its own becomes a paragraph.
 */
function htmlAsText() {
  const visit = (parent: MarkdownNode) => {
    parent.children = parent.children?.map((node) => {
      if (node.type !== "html") {
        visit(node);
        return node;
      }
      const text: MarkdownNode = { type: "text", value: node.value ?? "" };
      return BLOCK_PARENTS.has(parent.type) ? { type: "paragraph", children: [text] } : text;
    });
  };
  return (tree: MarkdownNode) => visit(tree);
}

// Tables, task lists, strikethrough and bare addresses as links; HTML as text; and a single line
// break kept as a line break, so a reply written as plain lines reads as it was written.
const PLUGINS = [remarkGfm, htmlAsText, remarkBreaks];

// Footnotes come with a heading meant for screen readers only; here it is a small heading anyone can read.
const TO_HTML = { footnoteLabelTagName: "h6", footnoteLabelProperties: {} };

type TreeNode = NonNullable<ExtraProps["node"]>;
type TreeChild = TreeNode["children"][number];

function textOf(node: TreeChild): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

/** How many columns a table has: the cells of its first row. */
function columnsOf(table: TreeNode | undefined): number {
  const firstRow = (node: TreeNode): TreeNode | null => {
    if (node.tagName === "tr") return node;
    for (const child of node.children) {
      const row = child.type === "element" ? firstRow(child) : null;
      if (row) return row;
    }
    return null;
  };
  const row = table ? firstRow(table) : null;
  return row ? row.children.filter((cell) => cell.type === "element").length : 1;
}

/** A fenced block of code: the language it was given, a button that copies it, and the code, which scrolls sideways. */
function CodeBlock({ code, language }: { code: string; language: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen to select by hand.
    }
  };

  return (
    <div className="overflow-hidden rounded-[10px] bg-surface shadow-[0_0_0_1px_var(--line-strong)]">
      <div className="flex h-8 items-center gap-3 border-b border-line pr-1 pl-3 text-[12px] text-muted">
        <span className="min-w-0 flex-1 truncate font-mono">{language}</span>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 font-medium transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-pane overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-[1.6]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Whether what is being drawn is the text of a link, where a second link can't go. */
const InsideLink = createContext(false);

/**
 * Only a web page or an email address is a link, and it opens in a new tab that can't reach back
 * into this one. Anything else keeps its words and leads nowhere.
 */
function Link({ href, children, ...rest }: ComponentProps<"a"> & ExtraProps) {
  // The arrow back up from a footnote: there is nothing to jump to here.
  if ("data-footnote-backref" in rest) return null;
  const link = safeLink(href);
  if (!link) return <span>{children}</span>;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer">
      <InsideLink value>{children}</InsideLink>
    </a>
  );
}

/**
 * A picture is not fetched: its address could have been planted to track the reader, or to carry
 * something out in the address itself. It is shown as a link, to open on purpose. A picture that
 * is itself the text of a link is its words only, and the link around it stays the link.
 */
function Picture({ src, alt }: ComponentProps<"img"> & ExtraProps) {
  const insideLink = useContext(InsideLink);
  const label = alt ? `Image: ${alt}` : "Image";
  const link = insideLink ? null : safeLink(typeof src === "string" ? src : null);
  if (!link) return <span>{label}</span>;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

const COMPONENTS: Components = {
  a: Link,
  img: Picture,

  // `pre` is a fenced (or indented) block; code inside a sentence is a bare `code` and is styled in CSS.
  pre({ node, children }) {
    const code = node?.children.find((child) => child.type === "element" && child.tagName === "code");
    if (!code || code.type !== "element") return <pre>{children}</pre>;
    return <CodeBlock code={textOf(code).replace(/\n$/, "")} language={codeLanguage(code.properties.className)} />;
  },

  // A table wider than the bubble scrolls sideways inside it. One of three or more columns says
  // how many it has: on a phone that sets how wide it may get before its text wraps (globals.css).
  table({ node, children }) {
    const columns = columnsOf(node);
    return (
      <div className="scroll-pane w-fit max-w-full overflow-x-auto rounded-[10px] bg-surface shadow-[0_0_0_1px_var(--line-strong)]">
        <table style={columns >= 3 ? ({ "--columns": columns } as CSSProperties) : undefined}>{children}</table>
      </div>
    );
  },

  // The box of a task list item, where the bullet would be (globals.css makes the room for it).
  // It shows what Tex wrote; it isn't something to tick.
  input({ type, checked }) {
    if (type !== "checkbox") return null;
    return (
      <span
        role="img"
        aria-label={checked ? "Done" : "To do"}
        className={cn(
          "absolute top-[3px] left-0 grid size-[15px] place-items-center rounded-[4px]",
          checked ? "bg-accent text-white" : "border-[1.5px] border-muted/50 bg-surface",
        )}
      >
        {checked && <CheckIcon size={11} strokeWidth={2.75} />}
      </span>
    );
  },
};

/** One reply of Tex's, drawn from Markdown. Parsed once per text, however often the thread redraws. */
function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={PLUGINS} remarkRehypeOptions={TO_HTML} components={COMPONENTS} urlTransform={safeLink}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
