import { randomUUID, webcrypto } from "node:crypto";
import { GENESIS, intentHash, verifyChain, type IntentLink, type VerifyResult } from "@/lib/chain";
import { buildLedger } from "@/lib/ledger";
import {
  parsePolicy,
  slipCore,
  slipNumber,
  round2,
  type SlipCore,
  type SlipPolicy,
} from "@/lib/slip";
import {
  CONFIDENCES,
  INTENT_STATUS,
  SOURCES,
  CONFIDENCE_PX,
  type CaseSummary,
  type CaseView,
  type Confidence,
  type Intent,
  type SlipResult,
  type Source,
} from "@/lib/types";
import { toSlipResult } from "@/lib/slip";
import type { CaseRow, ChainRow, IntentRow, Store } from "@/server/store/types";

const subtle = webcrypto.subtle;

export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Short, unambiguous (no 0/O/1/I) reference: PVN-4K7Q-9XZ2. */
export function newCaseRef(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = webcrypto.getRandomValues(new Uint8Array(8));
  const s = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `PVN-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function isCaseRef(value: string): boolean {
  return /^PVN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i.test(value);
}

export function normalizeRef(value: string): string {
  return value.trim().toUpperCase();
}

/** Deterministic two-letter double signature (a nod to commedia dell'arte). */
export function doubleFor(handle: string): string {
  const h = handle.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const a = h[0] ?? "X";
  const b = h[h.length - 1] ?? "X";
  return a + b;
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function toIntent(row: IntentRow): Intent {
  return {
    id: row.id,
    n: row.n,
    body: row.body,
    confidence: (CONFIDENCES as readonly string[]).includes(row.confidence) ? (row.confidence as Confidence) : "low",
    evidence: parseJsonArray(row.evidence),
    tags: parseJsonArray(row.tags),
    supersedes: row.supersedesId,
    status: (INTENT_STATUS as readonly string[]).includes(row.status) ? (row.status as Intent["status"]) : "active",
    hash: row.hash,
    byDouble: row.byDouble,
    source: (SOURCES as readonly string[]).includes(row.source) ? (row.source as Source) : "human",
    createdAt: row.createdAt,
    /** Blog-style failure handling: a record whose description is gone still shows. */
    unreadable: row.body.trim().length === 0,
  };
}

export function toLink(row: ChainRow, caseRef: string): IntentLink {
  return {
    caseRef,
    n: row.n,
    body: row.body,
    confidence: row.confidence as Confidence,
    evidence: parseJsonArray(row.evidence),
    tags: parseJsonArray(row.tags),
    supersedes: row.supersedesId,
    by: row.byDouble,
    source: row.source,
    createdAt: row.createdAt,
    prev: row.prevHash,
  };
}

/**
 * Recompute the chain for a case. Each link carries the case reference it was
 * signed under (taken from the case row, so renaming a case is not a breaking
 * change), and folding `hash` in as a no-op does not change the digest.
 */
export async function verifyCase(store: Store, row: CaseRow): Promise<VerifyResult> {
  const chain = await store.chainRows(row.id);
  const links = chain.map((r) => ({ ...toLink(r, row.ref), hash: r.hash }));
  return verifyChain(links, subtle);
}

export interface CaseAnalysis {
  ledgerEvents: ReturnType<typeof buildLedger>;
  slip: SlipCore;
  policy: SlipPolicy;
}

/**
 * The single place exposure is computed. Every surface — the case page, the
 * passport, the API, the RSS feed — reads from here, so they cannot disagree.
 */
export function analyze(row: CaseRow, rows: IntentRow[], now: Date): CaseAnalysis {
  const intents = rows.map(toIntent);
  const supersededAt = new Map<string, number>();
  for (const r of rows) {
    if (r.supersedesId) supersededAt.set(r.supersedesId, r.n);
  }
  const ledgerEvents = buildLedger(row.ref, intents, supersededAt);
  const policy = parsePolicy(row.policy);
  const slip = slipCore(ledgerEvents, policy, row.windowDays, now);
  return { ledgerEvents, slip, policy };
}

export async function summarize(store: Store, row: CaseRow, now = new Date()): Promise<CaseSummary> {
  const rows = await store.intents(row.id);
  const { slip, policy } = analyze(row, rows, now);
  const verified = await verifyCase(store, row);
  const cap = Number.isFinite(slip.cap) ? slip.cap : Math.max(1, Math.ceil(Math.abs(slip.drift)));

  return {
    ref: row.ref,
    title: row.title,
    kind: row.kind,
    owner: row.ownerId,
    open: row.open,
    sealedAt: row.sealedAt,
    head: row.head,
    intentCount: rows.length,
    slipped: slip.slipped,
    // Derived, never trusted from storage: the cap moves as a case grows, so a
    // value written under earlier rules cannot be taken as truth.
    slippedOn: slip.on,
    slip:
      slip.slipped && slip.on
        ? {
            authorization: slipNumber(row.head),
            policy,
            open_drift: Math.max(0, round2(slip.drift - cap)),
            exposure_cap: cap,
            window_days: row.windowDays,
            reference_px: CONFIDENCE_PX.medium,
            expires_at: new Date(Date.parse(slip.on) + row.windowDays * 86_400_000).toISOString(),
            issued_at: now.toISOString(),
          }
        : null,
    verified,
  };
}

export async function getCaseView(store: Store, row: CaseRow, now = new Date()): Promise<CaseView> {
  const rows = await store.intents(row.id);
  const summary = await summarize(store, row, now);
  return { ...summary, intents: rows.map(toIntent) };
}

export async function getSlipResult(row: CaseRow, rows: IntentRow[], now = new Date()): Promise<SlipResult> {
  const { slip, policy } = analyze(row, rows, now);
  return toSlipResult(slip, policy, row.windowDays, now);
}

export interface AppendIntentInput {
  body: string;
  confidence: Confidence;
  evidence: string[];
  tags: string[];
  /** Link number or intent id of the intent being amended. */
  supersedes?: string | null;
  source: Source;
  byHandle: string;
}

/**
 * Append one intent: validate, link it to the current head, hash it, and commit
 * atomically. Superseding an earlier intent marks that intent superseded in the
 * same write.
 */
export async function appendIntent(
  store: Store,
  row: CaseRow,
  input: AppendIntentInput,
  actorId: string | null,
): Promise<Intent> {
  if (!row.open) throw new DomainError("this case is sealed; start a new case instead of amending a sealed record", 409);
  const body = input.body.trim();
  if (!body) throw new DomainError("an intent needs a body", 422);
  if (body.length > 4000) throw new DomainError("intent body is limited to 4000 characters", 422);
  if (!(CONFIDENCES as readonly string[]).includes(input.confidence)) {
    throw new DomainError("confidence must be low, medium or high", 422);
  }

  const rows = await store.intents(row.id);
  const n = (rows[rows.length - 1]?.n ?? 0) + 1;
  const prevHash = rows[rows.length - 1]?.hash ?? GENESIS;

  let supersedesId: string | null = null;
  if (input.supersedes) {
    const target = rows.find((r) => String(r.n) === String(input.supersedes) || r.id === input.supersedes);
    if (!target) throw new DomainError(`cannot amend #${input.supersedes}: no such intent in this case`, 404);
    if (target.status === "withdrawn") throw new DomainError("cannot supersede a withdrawn intent", 422);
    supersedesId = target.id;
  }

  const createdAt = nowIso();
  const byDouble = doubleFor(input.byHandle);
  const link: IntentLink = {
    caseRef: row.ref,
    n,
    body,
    confidence: input.confidence,
    evidence: input.evidence,
    tags: input.tags,
    supersedes: supersedesId,
    by: byDouble,
    source: input.source,
    createdAt,
    prev: prevHash,
  };
  const hash = await intentHash(link, subtle);
  const id = randomUUID();

  await store.appendIntent({
    caseId: row.id,
    row: {
      id,
      caseId: row.id,
      n,
      body,
      confidence: input.confidence,
      evidence: JSON.stringify(input.evidence),
      tags: JSON.stringify(input.tags),
      supersedesId,
      status: "active",
      hash,
      prevHash,
      byDouble,
      source: input.source,
      createdAt,
    },
    head: hash,
    intentCount: n,
    supersedeId: supersedesId,
    event: {
      id: randomUUID(),
      caseId: row.id,
      actorId,
      type: supersedesId ? "intent.amend" : "intent.append",
      payload: JSON.stringify({ n, hash, supersedes: supersedesId }),
      createdAt,
    },
  });

  const after = await store.intents(row.id);
  const { slip } = analyze({ ...row, head: hash }, after, new Date());
  // Keep the column in step for operators reading the table directly; reads
  // always re-derive the value, so pointing it at `row.slippedOn` above is safe.
  const derivedSlippedOn = slip.slipped ? slip.on : null;
  if (row.slippedOn !== derivedSlippedOn) {
    await store.updateCase(row.id, { slippedOn: derivedSlippedOn });
  }

  const created = after.find((r) => r.id === id);
  if (!created) throw new DomainError("intent was written but could not be read back", 500);
  return toIntent(created);
}

/**
 * Flagging is a first-class act, not a tag: it appends an intent that supersedes
 * the target and marks the target `flagged`, which prices the original decision
 * at 1.5x its confidence when the ledger is replayed.
 */
export async function flagIntent(
  store: Store,
  row: CaseRow,
  targetN: number,
  reason: string,
  byHandle: string,
  actorId: string | null,
): Promise<{ intent: Intent; flaggedN: number }> {
  const rows = await store.intents(row.id);
  const target = rows.find((r) => r.n === targetN);
  if (!target) throw new DomainError(`there is no intent #${targetN} in this case`, 404);
  if (target.status === "withdrawn") throw new DomainError("cannot flag a withdrawn intent", 422);

  const intent = await appendIntent(
    store,
    row,
    {
      body: reason.trim() || `flag: #${targetN} was wrong`,
      confidence: "high",
      evidence: [],
      tags: ["flag"],
      supersedes: String(target.n),
      source: "human",
      byHandle,
    },
    actorId,
  );
  await store.setIntentStatus(rows.find((r) => r.id === target.id)!.caseId, target.id, "flagged", {
    id: randomUUID(),
    caseId: row.id,
    actorId,
    type: "intent.flag",
    payload: JSON.stringify({ flagged: target.n, by: intent.n, price: CONFIDENCE_PX.high }),
    createdAt: nowIso(),
  });
  return { intent, flaggedN: target.n };
}

export function caseCap(row: CaseRow, rows: IntentRow[], now = new Date()): number {
  const { slip } = analyze(row, rows, now);
  return Number.isFinite(slip.cap) ? slip.cap : -1;
}
