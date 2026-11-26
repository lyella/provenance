import type { Confidence } from "@/lib/types";

/**
 * Canonical serialization.
 *
 * Every hash in Provenance is computed over this function's output, never over
 * JSON.stringify of a live object. Key order, whitespace and line endings are
 * therefore not part of the record: two parties formatting the same intent
 * differently still produce the same hash, and a byte-level difference in the
 * *content* always changes it.
 */
export function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical: non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  throw new Error(`canonical: unsupported type ${typeof value}`);
}

export type SubtleLike = Pick<SubtleCrypto, "digest">;

/**
 * SHA-256 of the canonical form of `value`, hex encoded, lowercase.
 * Accepts an injectable digest implementation so the same code path runs in
 * the browser (WebCrypto) and in Node (node:crypto.webcrypto).
 */
export async function sha256Hex(value: unknown, subtle: SubtleLike): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The fields of an intent that are committed to. Everything here is hashed. */
export interface IntentPayload {
  caseRef: string;
  n: number;
  body: string;
  confidence: Confidence;
  evidence: string[];
  tags: string[];
  supersedes: string | null;
  by: string;
  source: string;
  createdAt: string;
}

/**
 * A link is the intent payload plus the hash of the previous link (Genesis uses
 * 64 zeros). The link hash covers both, so editing any intent changes its own
 * hash and every hash after it — the chain cannot be quietly rewritten.
 */
export interface IntentLink extends IntentPayload {
  prev: string;
}

export const GENESIS = "0".repeat(64);

/**
 * The one hash that defines a link, including the protocol version tag. Append
 * and verify both go through here; if they did not, a chain could never verify.
 */
export async function intentHash(link: IntentLink, subtle: SubtleLike): Promise<string> {
  const { prev, caseRef, n, body, confidence, evidence, tags, supersedes, by, source, createdAt } = link;
  return sha256Hex(
    { v: "pv.intent/1", caseRef, n, body, confidence, evidence, tags, supersedes, by, source, createdAt, prev },
    subtle,
  );
}

export interface VerifyResult {
  valid: boolean;
  brokenAt: number | null;
  reason: string;
  checked: number;
  recordedHead: string | null;
  computedHead: string;
}

/**
 * Recompute every link from genesis and compare each computed hash against the
 * hash that was recorded at write time. A tampered body, reordered link, removed
 * link, or rewritten predecessor all surface here.
 *
 * The `recordedHead` argument lets a third party check a chain published
 * elsewhere (the SDK's verify-only mode) without trusting this server's head.
 */
export async function verifyChain(
  stored: Array<IntentLink & { hash: string }>,
  subtle: SubtleLike,
  recordedHead?: string | null,
): Promise<VerifyResult> {
  let prev = GENESIS;
  for (let i = 0; i < stored.length; i++) {
    const link = stored[i];
    const expected = i + 1;
    if (link.n !== expected) {
      return {
        valid: false,
        brokenAt: expected,
        reason: `expected link #${expected}, found #${link.n}`,
        checked: i,
        recordedHead: null,
        computedHead: prev,
      };
    }
    if (link.prev !== prev) {
      return {
        valid: false,
        brokenAt: link.n,
        reason: "previous-link pointer does not match the chain",
        checked: i,
        recordedHead: null,
        computedHead: prev,
      };
    }
    const computed = await intentHash(link, subtle);
    if (computed !== link.hash) {
      return {
        valid: false,
        brokenAt: link.n,
        reason: `content does not match its recorded hash (expected ${computed.slice(0, 12)}…)`,
        checked: i,
        recordedHead: null,
        computedHead: prev,
      };
    }
    prev = computed;
  }
  const head = prev;
  if (recordedHead && recordedHead !== head) {
    return {
      valid: false,
      brokenAt: stored.length || 1,
      reason: "chain head does not match the published head",
      checked: stored.length,
      recordedHead,
      computedHead: head,
    };
  }
  return { valid: true, brokenAt: null, reason: "every link hashes to its recorded value", checked: stored.length, recordedHead: null, computedHead: head };
}
