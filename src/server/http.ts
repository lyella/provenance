import { cookies } from "next/headers";
import { hashSessionToken, SESSION_COOKIE } from "@/server/auth";
import { getStore } from "@/server/store";
import type { UserRow } from "@/server/store/types";

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const json = <T>(body: T, init?: ResponseInit): Response =>
  Response.json(body, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });

export const errorResponse = (err: unknown): Response => {
  if (err instanceof HttpError) {
    return json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "unexpected error";
  const isDomain = /sealed|no such intent|withdrawn|already exists|taken|not found/i.test(message);
  console.error("[provenance] request failed:", err);
  return json({ error: isDomain ? message : "internal error" }, { status: isDomain ? 400 : 500 });
};

export async function currentUser(): Promise<UserRow | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const store = getStore();
  const session = await store.findSession(hashSessionToken(token));
  if (!session) return null;
  if (Date.parse(session.expiresAt) < Date.now()) {
    await store.deleteSession(session.hash);
    return null;
  }
  return store.findUserById(session.userId);
}

export async function requireUser(): Promise<UserRow> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "sign in to continue");
  return user;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "request body must be valid JSON");
  }
}

/** Coarse per-client rate limit, enough to stop scripted abuse of public writes. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new HttpError(429, "too many requests; slow down and try again shortly");
  }
}

export function clientKey(request: Request, suffix: string): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${fwd ?? "local"}:${suffix}`;
}

/** Public origin for absolute links in API responses. */
export function requestOrigin(request: Request): string {
  const configured = process.env.PROVENANCE_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  return `${proto}://${host}`;
}
