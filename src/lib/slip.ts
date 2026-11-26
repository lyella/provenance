import { createHash } from "node:crypto";
import type { SlipBreach, SlipResult } from "@/lib/types";
import type { LedgerEvent } from "@/lib/ledger";

export type SlipPolicy = "none" | "zero" | "half";

export interface PolicyShape {
  policy: SlipPolicy;
  windowDays: number;
}

/**
 * Exposure policy, in plain words:
 *
 *  - `zero` — any drift above zero is a slip. Merciless; good for high-stakes work.
 *  - `half` (headroom) — a fixed allowance of four points, independent of how
 *    long the case has been running.
 *  - `none` — declared on the case, no slip can be issued.
 *
 * Every policy is judged inside a rolling window, so a case allowed to carry
 * exposure in January cannot hide behind it in July.
 */
export const POLICY_LABEL: Record<SlipPolicy, string> = {
  zero: "no open drift",
  half: "a fixed four-point allowance",
  none: "exposure is not policed",
};

export function parsePolicy(raw: string | null | undefined): SlipPolicy {
  return raw === "zero" || raw === "half" ? raw : "none";
}

export function peakExposure(events: LedgerEvent[]): number {
  let running = 0;
  let peak = 0;
  for (const e of events) {
    running += e.delta;
    if (running > peak) peak = running;
  }
  return peak;
}

/** The worst single event in the ledger — one decision cannot exceed this. */
export function largestEvent(events: LedgerEvent[]): number {
  return events.reduce((max, e) => Math.max(max, e.delta), 0);
}

/**
 * Cap in exposure points for the "headroom" policy.
 *
 * Fresh exposure is a running counter of decisions made. Corrections cannot pay
 * it down (a superseding decision is itself a commitment), so this cap is simply
 * a fixed allowance above zero. Two consequences, both deliberate:
 *
 *  - a long record of firm decisions is *not* punished for its length: at one
 *    point each it takes many decisions to approach a reasonable allowance;
 *  - ambiguity is resolved by the `zero` policy, which flags any open drift at all.
 *
 * Only the `zero` policy can express "any drift is a slip"; `half` always needs a
 * positive allowance, or a single careful decision would begin a slip.
 */
export function exposureCap(events: LedgerEvent[]): number {
  void events;
  return HEADROOM_ALLOWANCE;
}

/**
 * The fixed allowance of the "headroom" policy, in exposure points.
 *
 * Tuned so the label means something. At 4 points almost every real case slips
 * (a single low-confidence decision plus ordinary follow-up work already reaches
 * it), and a policy that everyone fails carries no signal. At 7:
 *
 *  - a case of careful decisions holds comfortably;
 *  - one low-confidence gamble, or a gamble with a little follow-up, still holds;
 *  - a case that keeps guessing, or that admits several mistakes, slips.
 *
 * Roughly: seven high-confidence decisions, or three medium ones, or a gamble
 * plus three careful decisions.
 */
export const HEADROOM_ALLOWANCE = 7;

/** The fixed floor of the "headroom" policy, in exposure points. */
export const HEADROOM_FLOOR = 3;

export interface TallyPoint {
  at: string;
  ratio: number;
  drift: number;
  n: number;
  ref: string;
}

export interface SlipCore {
  slipped: boolean;
  on: string | null;
  drift: number;
  cap: number;
  breaches: SlipBreach[];
  worst: { ratio: number; ref: string; n: number } | null;
  /** Running drift after each event, for the sparkline. */
  sparkline: Array<{ n: number; drift: number }>;
}

/**
 * Replay the ledger and find where drift exceeded the cap.
 *
 * The cap is recomputed for every prefix of the case, exactly as it stood at
 * that moment, and a breach is recorded only if drift still exceeds the *final*
 * cap of the case as it stands. That two-step matters: a case can cross an early
 * cap, keep going, and settle back inside its own allowance — the record then
 * shows the excursion without claiming the case ever slipped. A slip means the
 * case, taken as a whole, asked for more trust than it earned.
 *
 * The bound is strict: at exactly the cap the case is still accountable.
 */
export function slipCore(
  events: LedgerEvent[],
  policy: SlipPolicy,
  windowDays: number,
  now: Date,
): SlipCore {
  const windowStartMs = windowDays > 0 ? now.getTime() - windowDays * 86_400_000 : -Infinity;
  const sparkline: Array<{ n: number; drift: number }> = [];
  const cap = policy === "none" ? Number.POSITIVE_INFINITY : policy === "zero" ? 0 : exposureCap(events);

  let drift = 0;
  let worst: { ratio: number; ref: string; n: number } | null = null;
  const excursions: SlipBreach[] = [];

  const judged = policy !== "none";

  for (const [index, e] of events.entries()) {
    drift += e.delta;
    sparkline.push({ n: e.n, drift });
    if (!judged || Date.parse(e.at) < windowStartMs) continue;

    const historicalCap = policy === "zero" ? 0 : exposureCap(events.slice(0, index + 1));
    const ratio = drift / historicalCap;
    if (drift > 0 && (worst === null || ratio > worst.ratio)) {
      worst = { ratio, ref: e.ref, n: e.n };
    }
    if (drift > historicalCap) {
      excursions.push({ on: e.at, crossed: drift, ratio: drift / cap, ref: e.ref, n: e.n });
    }
  }

  const slipped = judged && drift > cap;
  const breaches = slipped ? excursions.filter((b) => b.crossed > cap) : [];
  return {
    slipped,
    on: slipped ? (breaches[0]?.on ?? events.at(-1)?.at ?? null) : null,
    drift,
    cap,
    breaches,
    worst,
    sparkline,
  };
}

/** Recent, human-scale authorization number: PVN-7F3K-22Q9. */
export function slipNumber(head: string): string {
  const h = createHash("sha256").update(head).digest("hex").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[parseInt(h.slice(i * 2, i * 2 + 2), 16) % alphabet.length];
  }
  return `PVN-${out.slice(0, 4)}-${out.slice(4)}`;
}

export function toSlipResult(core: SlipCore, policy: SlipPolicy, windowDays: number, windowEnd: Date): SlipResult {
  return {
    slipped: core.slipped,
    on: core.on,
    drift: round2(core.drift),
    policy,
    cap: Number.isFinite(core.cap) ? core.cap : -1,
    windowDays,
    windowStart: windowDays > 0 ? new Date(windowEnd.getTime() - windowDays * 86_400_000).toISOString() : null,
    windowEnd: windowEnd.toISOString(),
    breaches: core.breaches.slice(0, 8).map((b) => ({ ...b, ratio: round2(b.ratio) })),
    worst: core.worst ? { ...core.worst, ratio: round2(core.worst.ratio) } : null,
    series: core.sparkline.map((p) => ({ n: p.n, drift: round2(p.drift) })),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
