import { createRequire } from "node:module";
import path from "node:path";
import { createMemoryStore } from "@/server/store/memory";
import { createSqliteStore } from "@/server/store/sqlite";
import type { Store } from "@/server/store/types";

/**
 * Store selection, resolved once per process.
 *
 * Order: an explicit path in PROVENANCE_DB_PATH, then ./.data/provenance.db,
 * then an in-memory store when this runtime cannot provide SQLite (an older
 * Node, or a filesystem that is not writable). The chosen backend is logged
 * once and exposed on /api/status so nobody has to guess.
 */

const requireSqlite = createRequire(__filename);

/** `node:sqlite` exists from Node 22.5; the bundle may outlive its build host. */
function hasNodeSqlite(): boolean {
  try {
    requireSqlite("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

let cached: Store | null = null;

/**
 * Serverless platforms mount a read-only bundle and an ephemeral /tmp, so a
 * SQLite file there survives a warm instance at best and vanishes on the next
 * cold start. Pretending otherwise produces a demo that silently loses data, so
 * the platform is detected up front and the in-memory store is chosen openly —
 * `/api/status` reports which backend is live.
 *
 * Set VERCEL to "0" to override detection, or point PROVENANCE_DB_PATH at a
 * writable volume on a host that has one.
 */
function isEphemeral(): boolean {
  if (process.env.PROVENANCE_FORCE_DISK === "1") return false;
  return process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}

export function getStore(): Store {
  if (cached) return cached;

  const explicit = process.env.PROVENANCE_DB_PATH?.trim();
  const file = explicit && explicit.length > 0 ? path.resolve(explicit) : path.join(process.cwd(), ".data", "provenance.db");

  if (isEphemeral() && !explicit) {
    console.warn(
      "[provenance] serverless filesystem detected; using the in-memory store (data resets on cold start). " +
        "Set PROVENANCE_DB_PATH to a writable volume, or deploy to a host with a disk, for durable records.",
    );
    cached = createMemoryStore();
    return cached;
  }

  if (!hasNodeSqlite()) {
    console.warn("[provenance] this Node has no node:sqlite (needs >= 22.5); using the in-memory store");
    cached = createMemoryStore();
    return cached;
  }

  try {
    cached = createSqliteStore(file);
    console.info(`[provenance] store=sqlite file=${file}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[provenance] sqlite unavailable (${reason}); falling back to in-memory store`);
    cached = createMemoryStore();
  }
  return cached;
}

/** Test hook: replace the singleton between suites. */
export function setStore(store: Store | null): void {
  cached = store;
}
