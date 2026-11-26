export const CONFIDENCES = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** Exposure price in points per decision, by declared confidence. */
export const CONFIDENCE_PX: Record<Confidence, number> = {
  low: 4,
  medium: 2,
  high: 1,
};

export const INTENT_STATUS = ["active", "superseded", "withdrawn", "flagged"] as const;
export type IntentStatus = (typeof INTENT_STATUS)[number];

export const SOURCES = ["human", "agent", "import", "git"] as const;
export type Source = (typeof SOURCES)[number];

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
  source: Source;
  createdAt: string;
  unreadable: boolean;
}

export interface Verified {
  valid: boolean;
  brokenAt: number | null;
  reason: string;
  checked: number;
  recordedHead: string | null;
  computedHead: string;
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

export interface SlipBreach {
  on: string;
  crossed: number;
  ratio: number;
  ref: string;
  n: number;
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
  breaches: SlipBreach[];
  worst: { ratio: number; ref: string; n: number } | null;
  /** Running drift after each ledger event, for the exposure strip. */
  series: Array<{ n: number; drift: number }>;
}

export interface CaseSummary {
  ref: string;
  title: string;
  kind: string;
  owner: string | null;
  open: boolean;
  sealedAt: string | null;
  head: string;
  intentCount: number;
  slipped: boolean;
  slippedOn: string | null;
  slip: Slip | null;
  verified: Verified;
}

export interface CaseView extends CaseSummary {
  intents: Intent[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  handle: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
