import type { DemoState } from "./store";

export type Context = {
  request: Request;
  url: URL;
  /** Values of the `:name` parts of the matched path. */
  params: Record<string, string>;
  state: DemoState;
};

export type Handler = (context: Context) => Response | Promise<Response>;

export const nowIso = () => new Date().toISOString();

/** "send maya the notes" → "Send maya the notes" */
export const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Send this email" → "send this email" */
export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
