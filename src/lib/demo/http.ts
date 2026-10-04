// Small HTTP helpers for the demo backend: the contract's Error shape, JSON bodies and cursor pages.

export type JsonObject = Record<string, unknown>;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: JsonObject;

  constructor(status: number, code: string, message: string, details?: JsonObject) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: JsonObject) => new HttpError(400, "invalid_request", message, details);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const planLimit = (message: string) => new HttpError(403, "plan_limit", message);
/** The channel isn't in `available` (GET /v1/channels). `details.channel` names it, as the backend does. */
export const channelDisabled = (channel: string, message: string) => new HttpError(403, "channel_disabled", message, { channel });
export const rateLimited = () => new HttpError(429, "rate_limited", "Too many requests");
export const outOfCredits = () =>
  new HttpError(402, "out_of_credits", "You're out of credits. Upgrade, buy a top-up or redeem a code to carry on.");

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function errorResponse(error: HttpError): Response {
  return json(
    { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
    error.status,
  );
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a JSON object body. With `optional`, an empty body reads as `{}`. */
export async function readJson(request: Request, options: { optional?: boolean } = {}): Promise<JsonObject> {
  const text = await request.text();
  if (text.trim() === "") {
    if (options.optional) return {};
    throw badRequest("A JSON body is required");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest("The body isn't valid JSON");
  }
  if (!isRecord(parsed)) throw badRequest("The body must be a JSON object");
  return parsed;
}

/** Reads a string field, checking presence and length. Returns undefined when absent and not required. */
export function stringField(
  body: JsonObject,
  name: string,
  rules: { required?: boolean; min?: number; max?: number } = {},
): string | undefined {
  const value = body[name];
  if (value === undefined || value === null) {
    if (rules.required) throw badRequest(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw badRequest(`${name} must be a string`);
  if (rules.min !== undefined && value.length < rules.min) throw badRequest(`${name} is too short`);
  if (rules.max !== undefined && value.length > rules.max) throw badRequest(`${name} is too long`);
  return value;
}

export function requiredString(body: JsonObject, name: string, rules: { min?: number; max?: number } = {}): string {
  return stringField(body, name, { ...rules, required: true }) as string;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function readLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw badRequest("limit must be between 1 and 100");
  return limit;
}

// The cursor is the id of the last item already returned, so new items arriving at the top don't shift pages.
const encodeCursor = (id: string) => btoa(id);

function decodeCursor(cursor: string): string {
  try {
    return atob(cursor);
  } catch {
    throw badRequest("cursor isn't valid");
  }
}

export type Page<T> = { items: T[]; nextCursor: string | null };

/** Cuts one page out of a list that is already in display order (newest first). */
export function paginate<T extends { id: string }>(items: readonly T[], url: URL): Page<T> {
  const limit = readLimit(url);
  const cursor = url.searchParams.get("cursor");
  let start = 0;
  if (cursor) {
    const after = items.findIndex((item) => item.id === decodeCursor(cursor));
    if (after === -1) throw badRequest("cursor isn't valid");
    start = after + 1;
  }
  const page = items.slice(start, start + limit);
  const more = start + limit < items.length;
  return { items: page, nextCursor: more && page.length > 0 ? encodeCursor(page[page.length - 1].id) : null };
}
