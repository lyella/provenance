# Provenance

**Decision records that cannot be quietly rewritten — and that say when they slipped.**

Every project tracker records what you decided. None of them record *how sure you were*, and none of them make it
expensive to have been confident and wrong. Provenance does both, in a format anyone can verify without trusting the
server.

- Each decision ("intent") is written into a **SHA-256 hash chain**. Edit one word of history and every later hash
  changes.
- Each decision declares its **confidence**, and confidence sets an **exposure price**: low 4, medium 2, high 1.
- A case has an **exposure cap**. Cross it and the record issues a **Share Slip** — publicly, with the exact intent
  number, date and cap.
- Every claim is checkable **offline**, with the bundled CLI or in the browser.

## Try it in 30 seconds

```bash
npm install
npm run dev          # http://localhost:3000
```

Then, on the landing page, press **Run all** on the Autopilot. It plays out a real run: an agent makes twelve
decisions on a real case, flags one of its own earlier assumptions, and — because a flagged decision costs 1.5× its
confidence — crosses the cap and takes a slip. Every step is a signed intent on the server, not a mock.

To check the integrity claim yourself:

```bash
# after sealing a case, download its proof from the case sidebar, then:
npm run verify -- .data/some-proof.json
#   -> chain OK · N links · head …
# edit a single word in the JSON and run it again:
#   -> BROKEN at link 2 — this proof does not match its own history.
```

Or use **/verify** in the app, which recomputes every hash in your browser with WebCrypto.

## What makes it different

| | Typical portfolio app | Provenance |
| --- | --- | --- |
| Core claim | "I built a CRUD app" | A protocol with a checkable integrity property |
| Failure handling | Hidden | First-class: flags, reversals, slips, all on the record |
| Verification | Trust the database | Export, recompute, compare the head — no server needed |
| Agent support | Separate revamp | Any agent that can POST JSON, constrained by what it must declare |

The point is not that a slip is bad. The point is that a record with **no reversals and no slips tells you nothing** —
it means nothing risky was ever attempted, or nothing wrong was ever admitted.

## How it works

### 1. The chain

```
hash(link) = sha256( canonical({
  v: "pv.intent/1", caseRef, n, body, confidence, evidence[], tags[],
  supersedes, by, source, createdAt, prev
}) )

link[1].prev = "0" * 64            // genesis
link[i].prev = hash(link[i - 1])
head         = hash(link[n])       // published at /api/v1/cases/{ref}/anchor
```

Canonical form is JSON with sorted keys, no whitespace and NFC-normalised strings, so two people formatting the same
intent differently still produce the same hash. The same `intentHash` function signs a link on the server and
re-checks it in the browser.

### 2. The exposure ledger

| event | effect on drift |
| --- | --- |
| intent declared `low` / `medium` / `high` | `+4` / `+2` / `+1` |
| intent amended (superseded) | refund the original price |
| intent flagged as wrong | `-1.5 ×` its price, and the flag itself is a signed intent |

Drift is the running sum, judged inside a rolling window. Policies:

- **unpoliced** — nothing is priced against you.
- **zero** — any open drift is a slip. Deliberately merciless.
- **headroom** — a generous allowance: two decision-headroom above the case's peak, never below its largest single
  decision. One gamble is absorbed; a run of them is a pattern, and patterns are what slip.

### 3. The slip

When drift exceeds the cap, the case issues a Share Slip: a stable authorization number derived from the head, the
cap, the breach intent, the date, and the policy window. It appears on the case, the public share view, the Passport
timeline and the RSS feed.

## Design

The interface is neo-editorial — it should read like the front matter of a printed annual report, not a SaaS dashboard.

- **Type.** Fraunces, a high-contrast variable serif, carries every claim; Instrument Serif italic carries the one
  emphasised phrase per page; Geist Mono sets evidence — hashes, labels, numerals, code.
- **Colour.** Bone paper, ink, and a single vermilion reserved for a slip. When the record breaks, the page breaks with
  it; nothing else on screen is allowed to be saturated.
- **Structure.** Hairline rules and negative space instead of cards, oversized monospaced figures for amounts, and
  tabular numerals so nothing jitters mid-count.
- **Motion.** Purposeful and once-only: display type rises through an overflow mask, sections lift into place on
  scroll, numerals count up as a figure enters the viewport, and a stamp lands when a slip is issued. The static HTML
  always carries final values, so nothing depends on JavaScript, and everything collapses under
  `prefers-reduced-motion`.

Typography is loaded through `next/font`: self-hosted, no layout shift, no third-party request at runtime.

## Architecture

```
src/
  lib/            pure rules — no I/O, fully unit-tested
    chain.ts      canonical JSON, sha256, append/verify
    ledger.ts     confidence pricing, amendments, flags
    slip.ts       policies, cap, breach detection, slip numbers
  server/
    engine.ts     the only place cases are mutated (append, flag, seal, verify)
    store/        storage port + SQLite adapter (node:sqlite) + in-memory fallback
    autopilot.ts  deterministic demo agent
  app/            Next.js App Router UI and route handlers
    c/[ref]       the workspace: compose, amend, flag, seal, exposure strip
    s/[ref]       the public, read-only share view
    p/[handle]    the Passport: a person's public commitment record
    verify        in-browser verification
    code          CLI, API and format documentation
bin/provenance-verify.mjs   dependency-free offline verifier
tests/          44 tests over the invariants that matter
```

Deliberate choices:

- **Rules are pure functions.** Hashing, pricing and slip detection take data and return data; every one is covered by a
  test that would fail if the guarantee broke.
- **Storage is a port.** `node:sqlite` (Node ≥ 22.5) gives a real SQL database with no native compilation; the
  in-process fallback keeps previews working and reports itself at `/api/status`.
- **One place computes exposure.** The case page, Passport, RSS and API all read the same function, so they cannot
  disagree.
- **Appends are serialised.** Two writers racing on a case cannot claim the same link number; a sealed case rejects
  writes with `409`.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | session cookie (`HttpOnly`, `SameSite=Lax`) |
| `GET`/`POST` | `/api/v1/cases` | list / open a case |
| `POST` | `/api/v1/cases/{ref}/intents` | append an intent |
| `POST` | `/api/v1/cases/{ref}/flag/{n}` | flag a wrong decision (`1.5×`) |
| `POST` | `/api/v1/cases/{ref}/seal` | freeze and publish the head |
| `GET` | `/api/v1/cases/{ref}/verify` | public re-verification |
| `GET` | `/api/v1/cases/{ref}/export` | proof bundle for offline verification |
| `GET` | `/api/v1/cases/{ref}/anchor` | head + manual verification steps |
| `GET` | `/api/v1/cases/{ref}/slip` | the Share Slip, if any |
| `GET` | `/api/v1/passport/{handle}` | public commitment record |
| `POST` | `/api/v1/autopilot` | advance the demo run one step |
| `GET` | `/feed.xml` · `/api/openapi` · `/api/status` | RSS, schema, runtime info |

A typed client lives in `src/sdk/index.ts`.

## Deploying

The app runs on any Node 22.5+ host. Set `PROVENANCE_ORIGIN` to the public URL so anchors and share links are absolute.

```bash
npm run build && npm start          # any Node host, SQLite in ./.data
vercel deploy                       # or one command to Vercel (framework auto-detected)
```

**On data durability.** On Vercel, a serverless filesystem is read-only and ephemeral, so the app falls back to its
in-memory store and `/api/status` says `store: memory` — cases survive a warm instance, then reset. That is fine for a
portfolio demo, where every visitor builds their own case in a minute, and the app never pretends otherwise. For real
durability, either run it on a host with a disk (Railway, Fly, a VPS) or the local SQLite file via
`PROVENANCE_DB_PATH`, or add a Postgres adapter behind the existing `Store` port — it is one interface
(`src/server/store/types.ts`) and no rule has to change.

## Verifying the claims in this README

```bash
npm test        # 44 tests: hashing, canonical form, tampering, ledger, caps, slips, engine
npm run e2e     # against a running server: full case lifecycle + CLI proof verification
npm run lint && npm run typecheck && npm run build
```

## Scripts

```bash
npm run dev        # development
npm run build      # production build
npm start          # serve the production build
npm run preview    # build + serve on :3000; add --watch to rebuild on change
npm test           # unit tests (chain, ledger, slip, engine)
npm run typecheck  # next typegen + tsc
npm run lint       # eslint
npm run e2e        # end-to-end against a running server (BASE=http://127.0.0.1:3000)
npm run verify -- <proof.json|url>
```

`npm run preview -- --watch` exists because rebuilding rewrites `.next` underneath a running server, which leaves it
serving stale HTML and 500ing on chunks that no longer exist. The script stops the server, rebuilds, and starts it again
as one step.

**Schema migrations.** `CREATE TABLE IF NOT EXISTS` silently keeps an old table shape, so a schema change would break an
existing deployment while a fresh one worked. `src/server/store/sqlite.ts` therefore carries ordered, recorded
migrations (`schema_migrations`) that rebuild tables in place — ids are preserved, so every intent, event and hash
stays valid.
