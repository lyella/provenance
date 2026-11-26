# Deploying Provenance

Two routes. Both end with a public URL you can put in a portfolio.

The machine this was built on cannot reach `api.vercel.com` (the upload endpoint times out), so the steps below are written for **you** to run. Everything that could be prepared ahead of time is already done.

---

## Before you start: the data question

Vercel mounts a read-only bundle and an ephemeral `/tmp`. A SQLite file there survives a warm instance at best and disappears on the next cold start.

The app handles this honestly rather than pretending:

- On Vercel it uses an **in-memory store**, logs why, and `/api/status` reports `durable: false` with a plain-English note.
- Everything still works — sign-up, cases, chains, verification, the autopilot. Records simply reset when the instance recycles.

That is acceptable for a demo, where a visitor creates a case in about a minute. It is **not** acceptable if you want a lasting passport with your real decisions on it.

### Pick one

| Option | Durability | Effort |
|---|---|---|
| **A. Vercel, in-memory** | Resets on cold start | Zero. Good for the demo, not for a real passport. |
| **B. Vercel + a hosted Postgres** | Durable | One adapter behind the existing `Store` port (see below). |
| **C. A host with a disk** (Railway, Fly, a VPS) | Durable | Set `PROVENANCE_DB_PATH` to a volume path. No code changes. |

**For a portfolio, C is the least work for a durable result** — point `PROVENANCE_DB_PATH` at a mounted volume and the existing SQLite adapter does the rest. Any host with Node 22.5+ and a disk will run it:

```bash
npm ci
npm run build
npm start                 # honours $PORT, so Railway/Fly can assign it
```

`PROVENANCE_DB_PATH=/data/provenance.db` (or wherever the volume is mounted) is the only setting required for durable records. `npm start` honours the `PORT` environment variable — verified, not assumed.

The `Store` interface (`src/server/store/types.ts`) is small and every rule of the app sits above it, so B is a contained piece of work rather than a rewrite — roughly fifteen methods.

---

## Route 1 — GitHub, then deploy from the dashboard

This bypasses this machine's network entirely.

### 1. Create an empty repository on GitHub

Do **not** initialise it with a README, licence or `.gitignore` — the repo already has files.

### 2. Push the existing history

From `D:\proj`, with your own GitHub credentials:

```bash
git remote add origin https://github.com/<your-username>/provenance.git
git push -u origin main
```

Six commits are ready. Nothing sensitive is in them: the database, `.env` files, local caches and the `node_modules` tree are all ignored (verified with `git diff --cached` before the first commit, and a secret scan across the source).

### 3. Import on Vercel

1. Go to <https://vercel.com/new> and sign in as `lyella`.
2. Import the `provenance` repository.
3. Framework is detected as **Next.js**. Leave build and output settings alone.
4. Node version: the project needs **22.5 or newer** for `node:sqlite`. Vercel currently defaults this project to 26.x, which is fine. If you ever change it, keep it ≥ 22.5.
5. Add an environment variable:
   - `PROVENANCE_ORIGIN` = the final URL, e.g. `https://provenance-yourname.vercel.app`
   - This makes anchors and share links absolute rather than relative.
6. Deploy.

### 4. Tell me the URL

I will verify every route in production, check the chains verify, and confirm `/api/status` reports what it should.

---

## Route 2 — the CLI, from a network that can reach Vercel

```bash
cd D:\proj
vercel deploy            # preview URL
vercel deploy --prod     # production URL
```

The project is already linked to `lyella`'s Vercel account (`.vercel/project.json`), so no `vercel login` prompt should appear. If the upload step times out, it is the same network issue — use Route 1.

After the first deploy, set the origin for subsequent ones:

```bash
echo "https://your-url.vercel.app" | vercel env add PROVENANCE_ORIGIN production
```

---

## After deploying

### Seed the sample account (optional)

Gives reviewers something to look at immediately.

```bash
BASE=https://your-url.vercel.app node bin/seed-sample.mjs --base https://your-url.vercel.app
```

Creates `alex@provenance.demo` / `read-only-sample` with three cases: an incident that slipped, a forecast that held, and an open migration.

On Vercel the in-memory store means this vanishes on the next cold start — run it on route C if you want it to last.

### Check these URLs by hand

- `/` — the autopilot should issue a slip in about twelve seconds
- `/verify` — paste any exported proof; it recomputes in the browser
- `/p/alex` — the sample passport
- `/feed.xml` — sealed cases as RSS
- `/api/status` — confirm `durable` says what you expect
- `/code` — the CLI, API and format documentation

### Then update the portfolio

In `PORTFOLIO.md`, the last section has placeholders for the live demo, source and sample passport links.

---

## Honest notes for a reviewer

Keep these in mind and say them if asked:

1. **The frontend design is adapted from smartthings.de** — Fira Sans 900, JetBrains Mono, one flat accent band. The data model is original work; the styling is not. Say so plainly.
2. **Alex Rivera is seeded demo data**, and the autopilot is a deterministic scripted agent, not an LLM. Both are labelled in the UI.
3. **Auth is prototype-grade**: scrypt hashing and hashed session tokens, but no password reset, no email verification, no rate limiting on login.
4. **On Vercel the store is in-memory.** Data resets. `/api/status` says so.

None of these undermine the interesting part — a verifiable, confidence-priced decision ledger — and being straight about them is worth more than being caught overstating.
