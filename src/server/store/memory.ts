import type {
  CaseRow,
  ChainRow,
  EventRow,
  IntentRow,
  SessionRow,
  Store,
  UserRow,
} from "@/server/store/types";

/**
 * Process-local fallback store.
 *
 * Used for demos, tests and preview environments where no database file is
 * reachable. It keeps every guarantee the SQL adapter makes *within one
 * process*: ordered appends are serialised through a single write queue so two
 * concurrent writes can never claim the same link number, and every read
 * returns copies so callers cannot mutate stored state by accident.
 *
 * It is not durable across instances or restarts — the app reports its backend
 * on the /api/status endpoint so nobody has to guess which store is live.
 */

const clone = <T>(v: T): T => structuredClone(v);

export function createMemoryStore(): Store {
  const users = new Map<string, UserRow>();
  const cases = new Map<string, CaseRow>();
  const intents = new Map<string, IntentRow[]>();
  const events = new Map<string, EventRow[]>();
  const sessions = new Map<string, SessionRow>();

  let tail: Promise<unknown> = Promise.resolve();
  const write = <T>(fn: () => T): Promise<T> => {
    const next = tail.then(() => fn());
    tail = next.catch(() => undefined);
    return next;
  };

  const byRef = (ref: string) => [...cases.values()].find((c) => c.ref === ref) ?? null;
  const byEmail = (email: string) => [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  const byHandle = (handle: string) => [...users.values()].find((u) => u.handle === handle.toLowerCase()) ?? null;
  const caseIntents = (caseId: string) => (intents.get(caseId) ?? []).slice().sort((a, b) => a.n - b.n);

  return {
    kind: "memory",

    insertSession: async (s) => {
      sessions.set(s.hash, clone(s));
    },
    findSession: async (hash) => {
      const s = sessions.get(hash);
      if (!s) return null;
      if (Date.parse(s.expiresAt) < Date.now()) {
        sessions.delete(hash);
        return null;
      }
      return clone(s);
    },
    deleteSession: async (hash) => {
      sessions.delete(hash);
    },

    findUserByEmail: async (email) => clone(byEmail(email)),
    findUserById: async (id) => (users.has(id) ? clone(users.get(id)!) : null),
    findUserByHandle: async (handle) => clone(byHandle(handle)),
    insertUser: (u) =>
      write(() => {
        if (byEmail(u.email)) throw new Error("email already registered");
        if (byHandle(u.handle)) throw new Error("handle already taken");
        users.set(u.id, clone(u));
      }),

    listCasesByOwner: async (ownerId) =>
      [...cases.values()]
        .filter((c) => c.ownerId === ownerId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map(clone),
    findLatestCaseByKind: async (kind, createdAfter) =>
      clone(
        [...cases.values()]
          .filter((c) => c.kind === kind && (!createdAfter || c.createdAt >= createdAfter))
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null,
      ),
    listPublicCases: async (limit) =>
      [...cases.values()]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
        .map(clone),
    findCaseByRef: async (ref) => clone(byRef(ref)),
    findCaseById: async (id) => (cases.has(id) ? clone(cases.get(id)!) : null),

    insertCase: (c) =>
      write(() => {
        if (byRef(c.ref)) throw new Error("case ref already exists");
        cases.set(c.id, clone(c));
        intents.set(c.id, []);
      }),

    updateCase: (id, patch) =>
      write(() => {
        const current = cases.get(id);
        if (!current) throw new Error("case not found");
        cases.set(id, { ...current, ...clone(patch) });
      }),

    chainRows: async (caseId) =>
      caseIntents(caseId).map<ChainRow>((r) => ({
        n: r.n,
        body: r.body,
        confidence: r.confidence,
        evidence: r.evidence,
        tags: r.tags,
        supersedesId: r.supersedesId,
        byDouble: r.byDouble,
        source: r.source,
        createdAt: r.createdAt,
        prevHash: r.prevHash,
        hash: r.hash,
      })),

    intents: async (caseId) => caseIntents(caseId).map(clone),

    findIntent: async (caseId, intentId) => {
      const found = caseIntents(caseId).find((i) => i.id === intentId);
      return found ? clone(found) : null;
    },

    nextN: async (caseId) => {
      const rows = caseIntents(caseId);
      return rows.length ? rows[rows.length - 1].n : 0;
    },

    appendIntent: ({ caseId, row, head, intentCount, event, supersedeId }) =>
      write(() => {
        const current = cases.get(caseId);
        if (!current) throw new Error("case not found");
        const rows = intents.get(caseId) ?? [];
        if (rows.some((r) => r.n === row.n)) throw new Error(`link #${row.n} already exists`);
        rows.push(clone(row));
        intents.set(caseId, rows);
        if (supersedeId) {
          const target = rows.find((r) => r.id === supersedeId);
          if (target) target.status = "superseded";
        }
        cases.set(caseId, { ...current, head, intentCount });
        events.set(caseId, [clone(event), ...(events.get(caseId) ?? [])]);
      }),

    setIntentStatus: (caseId, intentId, status, event) =>
      write(() => {
        const target = (intents.get(caseId) ?? []).find((i) => i.id === intentId);
        if (target) target.status = status;
        events.set(caseId, [clone(event), ...(events.get(caseId) ?? [])]);
      }),

    listEvents: async (caseId, limit) => (events.get(caseId) ?? []).slice(0, limit).map(clone),
  };
}
