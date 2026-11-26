// Minimal, dependency-free client for the Provenance HTTP API.
// Runs unchanged in the browser, in Node, and in CI.

export type Confidence = "low" | "medium" | "high";
export type IntentStatus = "active" | "superseded" | "withdrawn" | "flagged";

export interface Intent {
  id: string;
  n: number;
  body: string;
  confidence: Confidence;
  evidence: string[];
  tags: string[];
  supersedes: string | null;
  status: IntentStatus;
  hash: string;
  byDouble: string;
  source: string;
  createdAt: string;
  unreadable: boolean;
}

export interface Slip {
  authorization: string;
  policy: string;
  open_drift: number;
  exposure_cap: number;
  window_days: number;
  reference_px: number;
  expires_at: string;
  issued_at: string;
}

export interface Verified {
  valid: boolean;
  brokenAt: number | null;
  reason: string;
  checked: number;
  recordedHead: string | null;
  computedHead: string;
}

export interface CaseSnap {
  ref: string;
  title: string;
  kind: string;
  owner: string;
  open: boolean;
  sealedAt: string | null;
  head: string;
  intentCount: number;
  slipped: boolean;
  slippedOn: string | null;
  slip: Slip | null;
  verified: Verified;
}

export interface CaseView extends CaseSnap {
  intents: Intent[];
}

export interface SlipResult {
  slipped: boolean;
  on: string | null;
  drift: number;
  policy: string;
  cap: number;
  windowDays: number;
  windowStart: string | null;
  windowEnd: string | null;
  breaches: Array<{ on: string; crossed: number; ratio: number; ref: string; n: number }>;
  worst: { ratio: number; ref: string; n: number } | null;
}

export interface SealReceipt {
  ref: string;
  sealedAt: string;
  head: string;
  anchor: string;
  anchorUrl: string;
  verified: Verified;
}

export class ProvenanceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ProvenanceClient {
  constructor(private baseUrl: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ProvenanceError(body?.error ?? res.statusText, res.status);
    return body as T;
  }

  listCases() {
    return this.call<{ cases: CaseSnap[] }>("/v1/cases");
  }

  getCase(ref: string) {
    return this.call<CaseView>(`/v1/cases/${ref}`);
  }

  verify(ref: string) {
    return this.call<Verified>(`/v1/cases/${ref}/verify`);
  }

  slip(ref: string) {
    return this.call<SlipResult>(`/v1/cases/${ref}/slip`);
  }

  createCase(input: { title: string; kind?: string; policy?: string; open?: boolean }) {
    return this.call<CaseView>("/v1/cases", { method: "POST", body: JSON.stringify(input) });
  }

  addIntent(ref: string, input: { body: string; confidence?: Confidence; evidence?: string[]; tags?: string[]; supersedes?: string }) {
    return this.call<{ intent: Intent }>(`/v1/cases/${ref}/intents`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  lastGitIntents(limit = 6) {
    return this.call<{ intents: Intent[]; source: string }>(`/v1/cases/git/last?limit=${limit}`);
  }
}

export function shortHash(h: string, len = 7) {
  return h.slice(0, len);
}

export function verifyChainShown(v: Verified) {
  if (v.valid) return `chain ok · ${v.checked} link${v.checked === 1 ? "" : "s"} · head ${shortHash(v.computedHead)}`;
  return `BROKEN at #${v.brokenAt} · ${v.reason}`;
}
