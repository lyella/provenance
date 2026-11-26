import { describe, expect, it } from "vitest";
import { buildLedger, CONFIDENCE_PX, type LedgerEvent } from "@/lib/ledger";
import { slipCore, exposureCap, peakExposure, slipNumber, round2 } from "@/lib/slip";
import type { Intent } from "@/lib/types";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 26, 0, minute)).toISOString();

const intent = (
  n: number,
  confidence: Intent["confidence"],
  status: Intent["status"] = "active",
  overrides: Partial<Intent> = {},
): Intent => ({
  id: `i${n}`,
  n,
  body: `decision ${n}`,
  confidence,
  evidence: [],
  tags: [],
  supersedes: null,
  status,
  hash: String(n).padStart(64, "0"),
  byDouble: "AD",
  source: "human",
  createdAt: at(n),
  unreadable: false,
  ...overrides,
});

const ledger = (intents: Intent[], supersededAt = new Map<string, number>()) =>
  buildLedger("PVN-AAAA-AAAA", intents, supersededAt);

describe("exposure pricing", () => {
  it("charges more for less confidence", () => {
    expect(CONFIDENCE_PX.low).toBeGreaterThan(CONFIDENCE_PX.medium);
    expect(CONFIDENCE_PX.medium).toBeGreaterThan(CONFIDENCE_PX.high);
  });

  it("refunds an amended decision at the moment it was amended", () => {
    // #1 was decided at minute 1 and amended by #2 at minute 2. The refund lands
    // in the sequence where the amendment happened, not retroactively.
    const events = ledger(
      [intent(1, "high"), intent(2, "high", "superseded"), intent(3, "low")],
      new Map([["i1", 2]]),
    );
    expect(events.map((e) => [e.kind, e.n, e.delta])).toEqual([
      ["intent", 1, 1],
      ["amend", 2, -1],
      ["intent", 2, 1],
      ["intent", 3, 4],
    ]);
    // net: +1 -1 +1 +4
    expect(events.reduce((sum, e) => sum + e.delta, 0)).toBe(5);
  });

  it("charges 1.5x when a decision is flagged", () => {
    const events = ledger(
      [
        intent(1, "medium", "flagged"),
        intent(2, "high", "active", { supersedes: "i1", tags: ["flag"] }),
      ],
      new Map([["i1", 2]]),
    );
    const drift = events.reduce((sum, e) => sum + e.delta, 0);
    // +2 (decision) -2 (amended by the flag) -4 (1.5x of 2, plus the flag's own
    // high-confidence price of 1) +1 (the flag recorded as a decision)
    expect(drift).toBe(-3);
    expect(events.some((e) => e.kind === "flag" && e.delta === -4)).toBe(true);
  });

  it("makes a flag cost more than a quiet amendment of the same decision", () => {
    const amended = ledger([intent(1, "high"), intent(2, "low", "superseded")], new Map([["i1", 2]]))
      .reduce((s, e) => s + e.delta, 0);
    const flagged = ledger(
      [intent(1, "high", "flagged"), intent(2, "low", "active", { supersedes: "i1", tags: ["flag"] })],
      new Map([["i1", 2]]),
    ).reduce((s, e) => s + e.delta, 0);
    expect(flagged).toBeLessThan(amended);
  });

  it("ignores withdrawn intents", () => {
    const events = ledger([intent(1, "low", "withdrawn")]);
    expect(events.every((e) => e.delta === 0)).toBe(true);
  });

  it("skips unreadable records rather than guessing", () => {
    const events = ledger([intent(1, "low", "active", { unreadable: true })]);
    expect(events).toHaveLength(0);
  });
});

describe("policy caps", () => {
  const events: LedgerEvent[] = [
    { kind: "intent", n: 1, at: at(1), ref: "c", delta: 4 },
    { kind: "intent", n: 2, at: at(2), ref: "c", delta: 2 },
  ];

  it("prices the cap from the widest excursion, with a 3-point floor", () => {
    expect(peakExposure(events)).toBe(6);
    expect(exposureCap(events)).toBe(5);
    expect(exposureCap([{ kind: "intent", n: 1, at: at(1), ref: "c", delta: 1 }])).toBe(3);
    expect(exposureCap([])).toBe(3);
  });
});

describe("slip detection", () => {
  const now = new Date(at(60));

  const series = (deltas: number[]): LedgerEvent[] =>
    deltas.map((delta, i) => ({ kind: "intent" as const, n: i + 1, at: at(i), ref: "c", delta }));

  it("does not slip a case that stays within policy", () => {
    const core = slipCore(series([1, 1]), "half", 14, now);
    expect(core.slipped).toBe(false);
    expect(core.on).toBeNull();
  });

  it("is never stricter than 'zero' for a case of one careful decision", () => {
    // zero is deliberately merciless: the first commitment already exceeds it.
    expect(slipCore(series([1]), "zero", 14, now).slipped).toBe(true);
    // half must not be, or nobody could ever start a case under it.
    expect(slipCore(series([1]), "half", 14, now).slipped).toBe(false);
  });

  it("lets one intentional gamble pass, but not a second", () => {
    // a low-confidence gamble (4) has a 3-point floor cap, so it crosses at once…
    expect(slipCore(series([4]), "half", 14, now).slipped).toBe(true);
    // …but a medium gamble (2) is absorbed, while two of them are not
    expect(slipCore(series([2]), "half", 14, now).slipped).toBe(false);
    expect(slipCore(series([2, 2]), "half", 14, now).slipped).toBe(true);
  });

  it("lets a case coast on firm calls until a guess lands on top", () => {
    expect(slipCore(series([1, 1, 1]), "half", 14, now).slipped).toBe(false);
    expect(slipCore(series([1, 1, 2]), "half", 14, now).slipped).toBe(true);
  });

  it("never slips a case made only of high-confidence decisions", () => {
    // three firm calls reach exactly the 3-point floor and hold
    expect(slipCore(series([1, 1, 1]), "half", 14, now).slipped).toBe(false);
  });

  it("slips when drift exceeds the cap and reports the crossing", () => {
    const core = slipCore(series([4, 4]), "half", 14, now);
    expect(core.slipped).toBe(true);
    expect(core.drift).toBe(8);
    expect(core.breaches[0].n).toBe(2);
  });

  it("treats exactly the cap as still accountable", () => {
    const core = slipCore(series([1, 1, 1]), "zero", 14, now);
    // under `zero` the cap is 0, so even a single firm decision crosses it
    expect(core.slipped).toBe(true);
    expect(core.breaches[0].crossed).toBe(1);
  });

  it("never issues a slip when the policy is unpoliced", () => {
    const core = slipCore(series([4, 4, 4]), "none", 14, now);
    expect(core.slipped).toBe(false);
    expect(core.drift).toBe(12);
  });

  it("only counts the rolling window", () => {
    const old: LedgerEvent[] = [{ kind: "intent", n: 1, at: new Date(Date.UTC(2026, 0, 1)).toISOString(), ref: "c", delta: 4 }];
    const recent: LedgerEvent[] = [{ kind: "intent", n: 2, at: at(30), ref: "c", delta: 1 }];
    const core = slipCore([...old, ...recent], "zero", 14, now);
    expect(core.slipped).toBe(true);
    // The old decision is outside the window, so only the recent one is judged.
    expect(core.breaches).toHaveLength(1);
    expect(core.breaches[0].n).toBe(2);
  });

  it("produces a display series for the exposure strip", () => {
    const core = slipCore(series([2, -1, 2]), "half", 14, now);
    expect(core.sparkline.map((p) => p.drift)).toEqual([2, 1, 3]);
  });
});

describe("formatting", () => {
  it("derives a stable, unambiguous slip number from the head", () => {
    const a = slipNumber("a".repeat(64));
    expect(a).toBe(slipNumber("a".repeat(64)));
    expect(a).not.toBe(slipNumber("b".repeat(64)));
    expect(a).toMatch(/^PVN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("rounds to two decimals without floating point noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
