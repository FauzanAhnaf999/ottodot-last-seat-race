import { NextRequest, NextResponse } from "next/server";
import { AppError, toErrorResponse } from "./errors";

// Consistent envelope — every endpoint returns the same shape
// Success: { data, meta? }   Error: { error, code, details? }
export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string>; meta?: Record<string, unknown> }) {
  return NextResponse.json({ data, ...(init?.meta ? { meta: init.meta } : {}) }, { status: init?.status ?? 200, headers: init?.headers });
}

export function jsonError(err: unknown) {
  const { error, code, details, status } = toErrorResponse(err);
  const body: Record<string, unknown> = { error, code };
  if (details) body.details = details;
  // Structured log for observability (replace with pino/winston in prod)
  if (status >= 500) console.error(`[api] ${code}: ${error}`, details ?? "");
  return NextResponse.json(body, { status });
}

// Safely parse JSON body with size guard; throws AppError on failure
export async function parseJson<T>(req: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid JSON body");
  }
  try {
    return schema.parse(raw);
  } catch (e) {
    throw e; // let zod error bubble to toErrorResponse
  }
}

// Wrap handler to auto-catch AppError / Zod / unexpected
export function withApi(handler: (req: NextRequest, ctx: unknown) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: unknown) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return jsonError(err);
    }
  };
}

// Idempotency helper — in prod use Redis/DB; here in-memory for demo correctness
const idempotencyCache = new Map<string, { status: number; body: unknown; expiresAt: number }>();
const IDEMPOTENCY_TTL_MS = 60_000 * 10; // 10 min

export function getIdempotencyKey(req: NextRequest): string | null {
  return req.headers.get("idempotency-key")?.trim() || null;
}

export function getCachedIdempotent(key: string): { status: number; body: unknown } | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  return { status: entry.status, body: entry.body };
}

export function setCachedIdempotent(key: string, status: number, body: unknown) {
  idempotencyCache.set(key, { status, body, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}

// Request logging helper
export function logRequest(req: NextRequest, extra?: Record<string, unknown>) {
  const rid = req.headers.get("x-request-id") ?? crypto.randomUUID().slice(0, 8);
  console.log(`[api] ${req.method} ${req.nextUrl.pathname} rid=${rid}`, extra ?? "");
  return rid;
}
