# Provenance — portfolio material

Everything here is written from the shipped code. Numbers are current: 7,700 lines across 64 files, 26 routes, 46 unit tests plus 30 end-to-end checks.

---

## One-liner

> A decision ledger that records how confident you were when you decided, prices that confidence, and keeps a tamper-evident record — including of the calls you got wrong.

## Short description (for a portfolio card, ~45 words)

Provenance is an open format for decision records. Every decision is hashed into a chain, priced by the confidence you declared, and published with a head hash anyone can verify offline. A case that takes on more exposure than it earned issues a permanent "slip" naming the decision that broke it.

## Full description (~150 words)

Most project trackers record *what* you decided. None record *how sure you were* — so "we shipped behind a flag" and "we released to everyone" look identical afterwards, even though one was careful and one was a gamble.

Provenance records both. Each decision declares a confidence, which sets an exposure price: a guess costs four points, a conviction costs one. Decisions chain by SHA-256, so editing one word of history invalidates every later hash. A case has a fixed allowance; cross it and the record issues a Slip — the exact decision, the date, the cap — permanently and publicly.

The result is a passport: a verifiable history of how someone actually makes decisions, reversals included. Verification needs no account and no trust in the server. There is a CLI that checks an exported proof in one command, and a browser verifier that recomputes every hash locally.

---

## Engineering highlights

Pick two or three for the portfolio; depth beats breadth.

### 1. Verification that doesn't trust the server

The integrity claim is only worth something if a sceptic can check it. A case exports as JSON with every link and its recorded hash. The CLI (`bin/provenance-verify.mjs`) has no dependencies — canonical JSON plus `node:crypto` — so it still works years after the deployment is gone. The same `intentHash` function runs on the server during writes and in the browser via WebCrypto during verification, so the two cannot drift apart.

*Detail worth mentioning:* the proof bundle's own copy of the collection is untrusted; verification recomputes from genesis and compares the head.

### 2. Finding a real bug in the exposure model

Building a sample account surfaced something the unit tests had baked in without noticing: under the original cap (`peak − 1`), a case that took a single low-confidence decision could **never** hold again. Drift is a running sum, so it never falls back below the cap — the case was mathematically condemned to slip however carefully it continued.

I proved it with a reachability check, then tried four formulations before accepting the honest conclusion: "any gamble is absorbed" and "long careful work never slips" are incompatible when points are a plain sum. The resolution was a fixed seven-point allowance — careful cases hold, one gamble holds, patterns of guessing slip — plus tests that encode both outcomes so the regression cannot return.

*Why this is the strongest story:* it shows the system's own outputs being used to critique the system, and a design decision changing because evidence contradicted the assumption.

### 3. Schema migrations for a shipped app

`CREATE TABLE IF NOT EXISTS` silently keeps an old table shape. A change to the `cases` table would have worked on a fresh database and broken an existing one. The store now carries ordered, recorded migrations (`schema_migrations`) that rebuild tables in place while preserving ids, so every existing intent, event and hash stays valid. Verified on a live database: 42 intents survived, nothing orphaned.

### 4. Storage as a port

Rules are pure functions with no I/O. Storage is an interface with two adapters — SQLite through Node's built-in `node:sqlite` (no native compilation) and an in-process store for previews. The chosen backend is reported at `/api/status` rather than silently guessed.

---

## Talking points for an interview

Have these ready; they invite the right questions.

- **"Why hash the timestamps?"** Because the record is what you claim, and backdating is the most natural forgery. It also means a demo cannot be honestly backdated — which is why the sample seeder recomputes every link after moving dates, rather than editing them in place.
- **"What happens when someone edits the database?"** The chain breaks and the app says so: the case reports `BROKEN at #1`, sealing is refused with 409, and the CLI rejects the export independently. Demonstrated by tampering with a copy of the database (`e2e` covers this).
- **"Isn't this just a blockchain?"** No. A single-writer append-only chain with a published head gives tamper-evidence without consensus, which is all this needs.
- **"What did you get wrong?"** The exposure policy — four times. Walking through that is more useful than claiming it worked first time.
- **"What's not done?"** Auth has no password reset or email verification; the data layer would need Postgres for durable serverless hosting. Ahead of the first real user, that's the next thing I'd fix.

---

## Tech list

Next.js 16 (App Router, Cache Components / Partial Prerendering) · React 19 · TypeScript · Tailwind CSS 4 · SQLite via `node:sqlite` · WebCrypto + `node:crypto` · Zod · Vitest · Playwright-style HTTP e2e · RFC-4180-safe RSS, OpenAPI 3.1

---

## Honest framing

Two things to be accurate about if asked, because a good interviewer will ask:

1. **The visual design is adapted from a reference site** (smartthings.de): Fira Sans at weight 900, JetBrains Mono for technical text, one flat accent band. Say so plainly — the interesting work is the data model, not the styling.
2. **The demo data is seeded.** Alex Rivera is a sample account; the autopilot is a deterministic scripted agent, labelled as such in the UI, not an LLM.

---

## Portfolio entry copy (ready to paste)

**Title:** Provenance — verifiable decision records

**Blurb:** A full-stack ledger where each decision records how confident you were, is hashed into a tamper-evident chain, and can be verified offline by anyone. Crossing your exposure allowance issues a permanent, public "slip" naming the decision that broke it.

**Stack:** Next.js, TypeScript, SQLite, WebCrypto, Vitest

**What I built:** the hash-chain format and its verifier, the confidence-priced exposure ledger, a zero-dependency CLI, a browser verifier, and 46 unit plus 30 end-to-end checks.

**Links:** [live demo] · [source] · [the verify page] · [a sample passport]
