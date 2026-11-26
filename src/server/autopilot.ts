import type { Confidence } from "@/lib/types";

/**
 * The Autopilot: a deterministic agent that opens a fresh case for a visitor
 * and takes real decisions against it.
 *
 * Why deterministic and not an LLM? Because a demo that can produce a slip must
 * be reproducible by the people judging it. Given the same seed the agent makes
 * the same calls, so anyone can re-run it and get the identical chain — and any
 * "agent" can speak this protocol, because the protocol constrains *what it
 * must declare* (confidence, evidence, amendments), not which model it is.
 *
 * The agent does not get to skip the discipline: every step is appended to the
 * chain like a human's would be, and the same exposure ledger prices it.
 */

export const AUTOPILOT_STEPS = 12;

export interface AgentState {
  seed: string;
  step: number;
  total: number;
  finished: boolean;
  ref: string | null;
 /** The last appended link number, for amend targets. */
  lastN: number | null;
  narrative: string[];
}

interface Situation {
  body: string;
  evidence: string[];
  tags: string[];
}

const SITUATIONS: Array<{ focus: string; situations: Situation[] }> = [
  {
    focus: "checkout",
    situations: [
      { body: "Ship the new checkout flow behind a feature flag for 5% of traffic.", evidence: ["load test: 1.2k rps"], tags: ["release"] },
      { body: "Payment retries will be handled by the client, not the gateway.", evidence: [], tags: ["architecture"] },
      { body: "Drop the address-validation step to reduce checkout friction.", evidence: ["support tickets: 41/week"], tags: ["ux", "assumption"] },
      { body: "Cut the checkout page's legacy analytics script to save 140ms.", evidence: [], tags: ["performance"] },
      { body: "Add a 'one-click reorder' path without a confirmation screen.", evidence: [], tags: ["ux", "assumption"] },
    ],
  },
  {
    focus: "data pipeline",
    situations: [
      { body: "Backfill the events table in place rather than into a shadow table.", evidence: [], tags: ["data", "assumption"] },
      { body: "Replace the nightly batch with a 5-minute incremental sync.", evidence: ["latency p95: 41min"], tags: ["architecture"] },
      { body: "Trust the upstream schema; add strict typing later.", evidence: [], tags: ["assumption"] },
      { body: "De-duplicate records by email instead of account id.", evidence: [], tags: ["data", "assumption"] },
    ],
  },
  {
    focus: "the migration",
    situations: [
      { body: "Run the ORM migration on production without a dry run; the staging run passed.", evidence: ["staging migration: 62s"], tags: ["release"] },
      { body: "Keep the old auth tokens valid indefinitely during rollout.", evidence: [], tags: ["security", "assumption"] },
      { body: "Use a single shared database for both tenants this quarter.", evidence: [], tags: ["architecture", "assumption"] },
      { body: "Skip per-tenant rate limits until traffic grows.", evidence: [], tags: ["performance", "assumption"] },
    ],
  },
];

/** A small, seeded PRNG so a run is exactly repeatable from its seed. */
function mulberry32(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AgentMove =
  | { kind: "intent"; body: string; confidence: Confidence; evidence: string[]; tags: string[]; say: string }
  | { kind: "amend"; target: number; body: string; confidence: Confidence; evidence: string[]; tags: string[]; say: string }
  | { kind: "flag"; target: number; body: string; confidence: Confidence; evidence: string[]; tags: string[]; say: string };

/**
 * One decision for the next step. Confidence is drawn from the seeded PRNG with
 * a deliberate bias toward overconfidence — the failure mode real teams have,
 * and the one this ledger is built to expose.
 */
export function nextMove(state: AgentState): AgentMove | null {
  if (state.step >= state.total) return null;
  const rand = mulberry32(`${state.seed}:${state.step}`);
  const situation = SITUATIONS[state.step % SITUATIONS.length].situations[Math.floor(rand() * SITUATIONS[state.step % SITUATIONS.length].situations.length)];
  const confidence: Confidence = rand() < 0.62 ? "high" : rand() < 0.55 ? "medium" : "low";

  // Early in a run the agent revises its own work; later it discovers that an
  // early assumption was wrong — the event that actually triggers a slip.
  if (state.step === 3 && state.lastN !== null) {
    return {
      kind: "amend",
      target: state.lastN,
      body: "Revised: keep the confirmation screen; drop only the second address entry.",
      confidence: "medium",
      evidence: [],
      tags: ["ux", "revision"],
      say: `Amending #${state.lastN}. I over-corrected on friction.`,
    };
  }
  if (state.step === 6 && state.lastN !== null && state.lastN >= 2) {
    return {
      kind: "flag",
      target: 2,
      body: "Flag: the assumption in #2 was wrong — the gateway rejects intents without a confirmed address, so the retry path lost 6% of orders.",
      confidence: "high",
      evidence: ["incident 4821", "lost orders: 6.1%"],
      tags: ["flag", "incident"],
      say: "I found the mistake. Flagging #2 — its assumption broke in production.",
    };
  }
  if (state.step === 9 && state.lastN !== null) {
    return {
      kind: "amend",
      target: Math.max(1, state.lastN - 2),
      body: "Revised: gate the change per-tenant rather than per-user cohort.",
      confidence: "low",
      evidence: [],
      tags: ["architecture", "revision"],
      say: "Re-planning. This one I'm not confident about, and I'm logging that.",
    };
  }

  return {
    kind: "intent",
    body: situation.body,
    confidence,
    evidence: situation.evidence,
    tags: situation.tags,
    say:
      confidence === "high"
        ? "Committing to this — I'm confident."
        : confidence === "medium"
          ? "Proceeding, with reservations."
          : "Proceeding, but I'm flagging this as a guess.",
  };
}

export function openingTitle(seed: string): string {
  const rand = mulberry32(`title:${seed}`);
  const focuses = SITUATIONS.map((s) => s.focus);
  const focus = focuses[Math.floor(rand() * focuses.length)];
  return `Autopilot run · ${focus}`;
}
