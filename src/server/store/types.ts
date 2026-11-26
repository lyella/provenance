import type { Source } from "@/lib/types";

/**
 * The storage port.
 *
 * Every rule of Provenance (hashing, the chain, the ledger, the slip) lives
 * above this interface and is pure. Storage only has to be *ordered and
 * durable*; the adapter picks how. That is what lets the identical engine run
 * on SQLite locally, and on a hosted SQL or key-value store without changing a
 * line of the rules.
 */

export interface UserRow {
  id: string;
  email: string;
  name: string;
  handle: string;
  passwordHash: string;
  createdAt: string;
}

export interface CaseRow {
  id: string;
  ref: string;
  /** Null for agent runs (the autopilot demo), which belong to no person. */
  ownerId: string | null;
  title: string;
  kind: string;
  policy: string;
  windowDays: number;
  open: boolean;
  sealedAt: string | null;
  head: string;
  intentCount: number;
  slippedOn: string | null;
  createdAt: string;
}

export interface IntentRow {
  id: string;
  caseId: string;
  n: number;
  body: string;
  confidence: string;
  evidence: string;
  tags: string;
  supersedesId: string | null;
  status: string;
  hash: string;
  prevHash: string;
  byDouble: string;
  source: Source;
  createdAt: string;
}

export interface EventRow {
  id: string;
  caseId: string;
  actorId: string | null;
  type: string;
  payload: string;
  createdAt: string;
}

/** Exactly the rows a link commits to, in chain order, for hashing. */
export interface ChainRow {
  n: number;
  body: string;
  confidence: string;
  evidence: string;
  tags: string;
  supersedesId: string | null;
  byDouble: string;
  source: string;
  createdAt: string;
  prevHash: string;
  hash: string;
}

export interface SessionRow {
  hash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Store {
  readonly kind: string;

  insertSession(row: SessionRow): Promise<void>;
  findSession(hash: string): Promise<SessionRow | null>;
  deleteSession(hash: string): Promise<void>;

  findUserByEmail(email: string): Promise<UserRow | null>;
  findUserById(id: string): Promise<UserRow | null>;
  findUserByHandle(handle: string): Promise<UserRow | null>;
  insertUser(user: UserRow): Promise<void>;

  listCasesByOwner(ownerId: string): Promise<CaseRow[]>;
  /** Most recent case of a given kind (e.g. this visitor's autopilot run). */
  findLatestCaseByKind(kind: string, createdAfter?: string): Promise<CaseRow | null>;
  listPublicCases(limit: number): Promise<CaseRow[]>;
  findCaseByRef(ref: string): Promise<CaseRow | null>;
  findCaseById(id: string): Promise<CaseRow | null>;
  insertCase(row: CaseRow): Promise<void>;
  updateCase(id: string, patch: Partial<CaseRow>): Promise<void>;

  /** Chain rows in commit order, with the join fields needed for hashing. */
  chainRows(caseId: string): Promise<ChainRow[]>;
  intents(caseId: string): Promise<IntentRow[]>;
  findIntent(caseId: string, intentId: string): Promise<IntentRow | null>;

  /**
   * Append one intent, bump the case head, and record an audit event — as one
   * atomic step. Two writers racing on the same case must not both succeed
   * with the same `n`.
   */
  appendIntent(args: {
    caseId: string;
    row: IntentRow;
    head: string;
    intentCount: number;
    event: EventRow;
    supersedeId?: string | null;
  }): Promise<void>;

  setIntentStatus(caseId: string, intentId: string, status: string, event: EventRow): Promise<void>;
  listEvents(caseId: string, limit: number): Promise<EventRow[]>;

  /** Highest `n` currently in the case; 0 for an empty chain. */
  nextN(caseId: string): Promise<number>;
}
