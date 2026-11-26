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

export function getStore(): Store {
  if (cached) return cached;

  const explicit = process.env.PROVENANCE_DB_PATH?.trim();
  const file = explicit && explicit.length > 0 ? path.resolve(explicit) : path.join(process.cwd(), ".data", "provenance.db");

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
