import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  CaseRow,
  ChainRow,
  EventRow,
  IntentRow,
  Store,
  UserRow,
} from "@/server/store/types";

/**
 * SQLite adapter over Node's built-in `node:sqlite` (Node >= 22.5).
 *
 * `node:sqlite` is used deliberately: the app ships with a real SQL database
 * and zero native compilation. TypeScript's lib does not carry declarations for
 * it across all supported `@types/node` versions, so the module is loaded at
 * runtime and typed through a narrow local interface below.
 */

interface SqlStatement {
  run(...params: unknown[]): { changes: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (location: string) => SqlDatabase;
}

const requireSqlite = createRequire(__filename);

function loadSqlite(): SqliteModule {
  try {
    return requireSqlite("node:sqlite") as SqliteModule;
  } catch {
    throw new Error(
      "Provenance needs Node 22.5+ for its local SQLite store (node:sqlite). " +
        "Run `nvm use 24`, or set DATABASE_URL to a hosted Postgres database.",
    );
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  owner_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  policy TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  open INTEGER NOT NULL DEFAULT 1,
  sealed_at TEXT,
  head TEXT NOT NULL,
  intent_count INTEGER NOT NULL DEFAULT 0,
  slipped_on TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cases_owner ON cases(owner_id);
CREATE TABLE IF NOT EXISTS intents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  n INTEGER NOT NULL,
  body TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence TEXT NOT NULL,
  tags TEXT NOT NULL,
  supersedes_id TEXT,
  status TEXT NOT NULL,
  hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  by_double TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(case_id, n)
);
CREATE INDEX IF NOT EXISTS intents_case ON intents(case_id, n);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  actor_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_case ON events(case_id, created_at);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

function open(file: string): SqlDatabase {
  mkdirSync(path.dirname(file), { recursive: true });
  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/**
 * Forward migrations for databases created by earlier builds.
 *
 * `CREATE TABLE IF NOT EXISTS` silently keeps an old shape, so a schema change
 * has to be applied explicitly or an existing deployment breaks while a fresh
 * one works. Each entry runs once and is recorded in `schema_migrations`.
 */
const MIGRATIONS: Array<{ id: string; run: (db: SqlDatabase) => void }> = [
  {
    id: "001_agent_cases_may_have_no_owner",
    // Agent runs (the autopilot demo) belong to no person. SQLite cannot drop a
    // NOT NULL, so the table is rebuilt; ids are preserved, so every intent and
    // event keeps pointing at the same case and every hash stays valid.
    run: (db) => {
      const columns = db.prepare("PRAGMA table_info(cases)").all() as Array<Record<string, unknown>>;
      const owner = columns.find((c) => c.name === "owner_id");
      if (!owner || Number(owner.notnull) === 0) return;

      db.exec("PRAGMA foreign_keys = OFF");
      db.exec("BEGIN");
      try {
        db.exec(`
          CREATE TABLE cases_new (
            id TEXT PRIMARY KEY,
            ref TEXT NOT NULL UNIQUE,
            owner_id TEXT REFERENCES users(id),
            title TEXT NOT NULL,
            kind TEXT NOT NULL,
            policy TEXT NOT NULL,
            window_days INTEGER NOT NULL,
            open INTEGER NOT NULL DEFAULT 1,
            sealed_at TEXT,
            head TEXT NOT NULL,
            intent_count INTEGER NOT NULL DEFAULT 0,
            slipped_on TEXT,
            created_at TEXT NOT NULL
          );
          INSERT INTO cases_new SELECT id, ref, owner_id, title, kind, policy, window_days, open,
            sealed_at, head, intent_count, slipped_on, created_at FROM cases;
          DROP TABLE cases;
          ALTER TABLE cases_new RENAME TO cases;
          CREATE INDEX IF NOT EXISTS cases_owner ON cases(owner_id);
        `);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      } finally {
        db.exec("PRAGMA foreign_keys = ON");
      }
    },
  },
];

function migrate(db: SqlDatabase): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((r) => r.id),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    migration.run(db);
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migration.id, new Date().toISOString());
    console.info(`[provenance] applied migration ${migration.id}`);
  }
}

type Raw = Record<string, unknown>;

const userFrom = (r: Raw): UserRow => ({
  id: String(r.id),
  email: String(r.email),
  name: String(r.name),
  handle: String(r.handle),
  passwordHash: String(r.password_hash),
  createdAt: String(r.created_at),
});

const caseFrom = (r: Raw): CaseRow => ({
  id: String(r.id),
  ref: String(r.ref),
  ownerId: r.owner_id === null ? null : String(r.owner_id),
  title: String(r.title),
  kind: String(r.kind),
  policy: String(r.policy),
  windowDays: Number(r.window_days),
  open: Number(r.open) === 1,
  sealedAt: r.sealed_at === null ? null : String(r.sealed_at),
  head: String(r.head),
  intentCount: Number(r.intent_count),
  slippedOn: r.slipped_on === null ? null : String(r.slipped_on),
  createdAt: String(r.created_at),
});

const intentFrom = (r: Raw): IntentRow => ({
  id: String(r.id),
  caseId: String(r.case_id),
  n: Number(r.n),
  body: String(r.body),
  confidence: String(r.confidence),
  evidence: String(r.evidence),
  tags: String(r.tags),
  supersedesId: r.supersedes_id === null ? null : String(r.supersedes_id),
  status: String(r.status),
  hash: String(r.hash),
  prevHash: String(r.prev_hash),
  byDouble: String(r.by_double),
  source: String(r.source) as IntentRow["source"],
  createdAt: String(r.created_at),
});

const chainFrom = (r: Raw): ChainRow => ({
  n: Number(r.n),
  body: String(r.body),
  confidence: String(r.confidence),
  evidence: String(r.evidence),
  tags: String(r.tags),
  supersedesId: r.supersedes_id === null ? null : String(r.supersedes_id),
  byDouble: String(r.by_double),
  source: String(r.source),
  createdAt: String(r.created_at),
  prevHash: String(r.prev_hash),
  hash: String(r.hash),
});

const eventFrom = (r: Raw): EventRow => ({
  id: String(r.id),
  caseId: String(r.case_id),
  actorId: r.actor_id === null ? null : String(r.actor_id),
  type: String(r.type),
  payload: String(r.payload),
  createdAt: String(r.created_at),
});

const CASE_PATCH_COLUMNS: Record<keyof CaseRow, string> = {
  id: "id",
  ref: "ref",
  ownerId: "owner_id",
  title: "title",
  kind: "kind",
  policy: "policy",
  windowDays: "window_days",
  open: "open",
  sealedAt: "sealed_at",
  head: "head",
  intentCount: "intent_count",
  slippedOn: "slipped_on",
  createdAt: "created_at",
};

export function createSqliteStore(file: string): Store {
  const db = open(file);

  const one = <T>(sql: string, params: unknown[], map: (r: Raw) => T): T | null => {
    const row = db.prepare(sql).get(...params);
    return row ? map(row as Raw) : null;
  };
  const many = <T>(sql: string, params: unknown[], map: (r: Raw) => T): T[] =>
    db.prepare(sql).all(...params).map((r) => map(r as Raw));

  return {
    kind: "sqlite",

    insertSession: (s) => {
      db.prepare("INSERT INTO sessions (hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
        s.hash,
        s.userId,
        s.createdAt,
        s.expiresAt,
      );
      return Promise.resolve();
    },
    findSession: (hash) => {
      const row = db.prepare("SELECT * FROM sessions WHERE hash = ?").get(hash) as Raw | undefined;
      return Promise.resolve(
        row ? { hash: String(row.hash), userId: String(row.user_id), createdAt: String(row.created_at), expiresAt: String(row.expires_at) } : null,
      );
    },
    deleteSession: (hash) => {
      db.prepare("DELETE FROM sessions WHERE hash = ?").run(hash);
      return Promise.resolve();
    },

    findUserByEmail: (email) => Promise.resolve(one("SELECT * FROM users WHERE email = ?", [email.toLowerCase()], userFrom)),
    findUserById: (id) => Promise.resolve(one("SELECT * FROM users WHERE id = ?", [id], userFrom)),
    findUserByHandle: (handle) => Promise.resolve(one("SELECT * FROM users WHERE handle = ?", [handle.toLowerCase()], userFrom)),

    insertUser: (u) => {
      db.prepare("INSERT INTO users (id, email, name, handle, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        u.id,
        u.email.toLowerCase(),
        u.name,
        u.handle.toLowerCase(),
        u.passwordHash,
        u.createdAt,
      );
      return Promise.resolve();
    },

    listCasesByOwner: (ownerId) =>
      Promise.resolve(many("SELECT * FROM cases WHERE owner_id = ? ORDER BY created_at DESC", [ownerId], caseFrom)),
    findLatestCaseByKind: (kind, createdAfter) =>
      Promise.resolve(
        createdAfter
          ? one("SELECT * FROM cases WHERE kind = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1", [kind, createdAfter], caseFrom)
          : one("SELECT * FROM cases WHERE kind = ? ORDER BY created_at DESC LIMIT 1", [kind], caseFrom),
      ),
    listPublicCases: (limit) =>
      Promise.resolve(many("SELECT * FROM cases ORDER BY created_at DESC LIMIT ?", [limit], caseFrom)),
    findCaseByRef: (ref) => Promise.resolve(one("SELECT * FROM cases WHERE ref = ?", [ref], caseFrom)),
    findCaseById: (id) => Promise.resolve(one("SELECT * FROM cases WHERE id = ?", [id], caseFrom)),

    insertCase: (c) => {
      db.prepare(
        "INSERT INTO cases (id, ref, owner_id, title, kind, policy, window_days, open, sealed_at, head, intent_count, slipped_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(c.id, c.ref, c.ownerId, c.title, c.kind, c.policy, c.windowDays, c.open ? 1 : 0, c.sealedAt, c.head, c.intentCount, c.slippedOn, c.createdAt);
      return Promise.resolve();
    },

    updateCase: (id, patch) => {
      const keys = Object.keys(patch) as Array<keyof CaseRow>;
      if (keys.length === 0) return Promise.resolve();
      const sets = keys.map((k) => `${CASE_PATCH_COLUMNS[k]} = ?`).join(", ");
      const values = keys.map((k) => {
        const v = patch[k];
        return typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number | null);
      });
      db.prepare(`UPDATE cases SET ${sets} WHERE id = ?`).run(...values, id);
      return Promise.resolve();
    },

    chainRows: (caseId) => Promise.resolve(many("SELECT * FROM intents WHERE case_id = ? ORDER BY n ASC", [caseId], chainFrom)),
    intents: (caseId) => Promise.resolve(many("SELECT * FROM intents WHERE case_id = ? ORDER BY n ASC", [caseId], intentFrom)),
    findIntent: (caseId, intentId) =>
      Promise.resolve(one("SELECT * FROM intents WHERE case_id = ? AND id = ?", [caseId, intentId], intentFrom)),

    nextN: (caseId) => {
      const row = db.prepare("SELECT COALESCE(MAX(n), 0) AS n FROM intents WHERE case_id = ?").get(caseId) as { n: number } | undefined;
      return Promise.resolve(Number(row?.n ?? 0));
    },

    appendIntent: ({ caseId, row, head, intentCount, event, supersedeId }) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT INTO intents (id, case_id, n, body, confidence, evidence, tags, supersedes_id, status, hash, prev_hash, by_double, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(row.id, caseId, row.n, row.body, row.confidence, row.evidence, row.tags, row.supersedesId, row.status, row.hash, row.prevHash, row.byDouble, row.source, row.createdAt);
        if (supersedeId) {
          db.prepare("UPDATE intents SET status = 'superseded' WHERE id = ?").run(supersedeId);
        }
        db.prepare("UPDATE cases SET head = ?, intent_count = ? WHERE id = ?").run(head, intentCount, caseId);
        db.prepare("INSERT INTO events (id, case_id, actor_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          event.id,
          event.caseId,
          event.actorId,
          event.type,
          event.payload,
          event.createdAt,
        );
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return Promise.resolve();
    },

    setIntentStatus: (caseId, intentId, status, event) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE intents SET status = ? WHERE id = ? AND case_id = ?").run(status, intentId, caseId);
        db.prepare("INSERT INTO events (id, case_id, actor_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          event.id,
          event.caseId,
          event.actorId,
          event.type,
          event.payload,
          event.createdAt,
        );
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return Promise.resolve();
    },

    listEvents: (caseId, limit) =>
      Promise.resolve(many("SELECT * FROM events WHERE case_id = ? ORDER BY created_at DESC LIMIT ?", [caseId, limit], eventFrom)),
  };
}
