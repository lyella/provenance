import type { Confidence, Intent, IntentStatus } from "@/lib/types";

/**
 * Confidence is not a vibe, it is a weighted position. An intent declared
 * "low" moves the case by 4 points per decision; "high" moves it 1.
 *
 * The asymmetry is deliberate: a decision taken while unsure must be corrected
 * twice as often as one taken with conviction before the case is back where it
 * started. That is the whole idea of the exposure ledger.
 */
export const CONFIDENCE_PX: Record<Confidence, number> = {
  low: 4,
  medium: 2,
  high: 1,
};

export type LedgerEvent =
  | { kind: "intent"; n: number; at: string; ref: string; delta: number }
  | { kind: "amend"; n: number; at: string; ref: string; delta: number }
  | { kind: "flag"; n: number; at: string; ref: string; delta: number };

/**
 * Signed exposure of an anchor intent at the moment it was written.
 *
 * - +px  when an intent is first added (a decision made).
 * - -px  when it is amended (a decision corrected) or superseded.
 * - -1.5x when a later intent flags it (a wrong decision found upstream). The
 *   flag itself is still a decision (it carries its own +px as a normal intent),
 *   so its own price is netted out of the charge — otherwise a confident flag
 *   pays barely more than a quiet amendment, and the whole review is theatre.
 *
 * Drift is the running sum. It is not capped: exposure can go negative (a case
 * that was revised more than it was committed), and that is reported honestly
 * rather than clamped to zero.
 */
export function intentDelta(confidence: Confidence, status: IntentStatus, superseded: boolean): number {
  const px = CONFIDENCE_PX[confidence];
  if (status === "withdrawn") return 0;
  if (superseded) return -px;
  return px;
}

/**
 * Replay the ledger for a case in commit order.
 *
 * `supersededAt` maps an intent id to the n of the intent that superseded it,
 * so the ledger shows the exact position in the sequence where a decision was
 * corrected rather than retroactively rewriting history.
 */
export function buildLedger(
  caseRef: string,
  intents: Intent[],
  supersededAt: Map<string, number>,
): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  const byId = new Map(intents.map((i) => [i.id, i]));
  for (const intent of intents) {
    if (intent.unreadable) continue;
    if (intent.status === "withdrawn") {
      events.push({ kind: "intent", n: intent.n, at: intent.createdAt, ref: caseRef, delta: 0 });
      continue;
    }
    const supersededBy = supersededAt.get(intent.id);
    if (supersededBy === undefined) {
      events.push({
        kind: "intent",
        n: intent.n,
        at: intent.createdAt,
        ref: caseRef,
        delta: CONFIDENCE_PX[intent.confidence],
      });
      continue;
    }
    events.push({
      kind: "intent",
      n: intent.n,
      at: intent.createdAt,
      ref: caseRef,
      delta: CONFIDENCE_PX[intent.confidence],
    });
    const superseder = intents.find((i) => i.n === supersededBy);
    events.push({
      kind: "amend",
      n: supersededBy,
      at: superseder?.createdAt ?? intent.createdAt,
      ref: caseRef,
      delta: -CONFIDENCE_PX[intent.confidence],
    });
  }

  for (const anchor of intents) {
    if (anchor.status !== "flagged" || anchor.unreadable) continue;
    const flagger = intents.find((i) => i.supersedes === anchor.id) ?? byId.get(anchor.id);
    const flagPx = flagger ? CONFIDENCE_PX[flagger.confidence] : 0;
    events.push({
      kind: "flag",
      n: flagger?.n ?? anchor.n,
      at: flagger?.createdAt ?? anchor.createdAt,
      ref: caseRef,
      delta: -(CONFIDENCE_PX[anchor.confidence] * 1.5 + flagPx),
    });
  }

  return events.sort((a, b) => (a.at === b.at ? a.n - b.n : a.at < b.at ? -1 : 1));
}
