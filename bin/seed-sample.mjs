// Build a complete sample account with realistic history.
//
// Timestamps are part of what a link hashes, so a record cannot simply be moved
// into the past — that invalidates it, and the server rightly refuses to seal a
// broken chain. This script therefore does it honestly: it writes each intent,
// rewrites its created_at, then RECOMPUTES every link hash in order from genesis
// so the chain is genuinely valid at its new timestamps. The result verifies
// exactly like a case lived through in real time.
//
// Usage: node bin/seed-sample.mjs [--base http://127.0.0.1:3000]
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://127.0.0.1:3000";

const SAMPLE_PASSWORD = process.env.PROVENANCE_SAMPLE_PASSWORD;
if (!SAMPLE_PASSWORD) {
  console.error("error: set PROVENANCE_SAMPLE_PASSWORD to seed the sample account (no default password is shipped)");
  process.exit(2);
}

const ACCOUNT = {
  name: "Alex Rivera",
  handle: "alex",
  email: "alex@provenance.demo",
  password: SAMPLE_PASSWORD,
};

let cookie = "";
async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (c.startsWith("pv_session=")) cookie = c.split(";")[0];
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const daysAgo = (d, hour = 10) => {
  const date = new Date(Date.now() - d * 86_400_000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const db = new DatabaseSync(process.env.PROVENANCE_DB_PATH ?? "D:/proj/.data/provenance.db");

/* ---------- hashing, mirroring src/lib/chain.ts exactly ---------- */

function canonical(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

async function intentHash(link) {
  const payload = {
    v: "pv.intent/1",
    caseRef: link.caseRef,
    n: link.n,
    body: link.body,
    confidence: link.confidence,
    evidence: link.evidence,
    tags: link.tags,
    supersedes: link.supersedes,
    by: link.by,
    source: link.source,
    createdAt: link.createdAt,
    prev: link.prev,
  };
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(payload)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const GENESIS = "0".repeat(64);
const parse = (raw) => {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/** Rewrite every link hash for a case, in order, from genesis. */
async function rechain(ref) {
  const row = db.prepare("select id, ref from cases where ref = ?").get(ref);
  const links = db.prepare("select * from intents where case_id = ? order by n asc").all(row.id);
  let prev = GENESIS;
  let head = GENESIS;
  for (const l of links) {
    const hash = await intentHash({
      caseRef: row.ref,
      n: l.n,
      body: l.body,
      confidence: l.confidence,
      evidence: parse(l.evidence),
      tags: parse(l.tags),
      supersedes: l.supersedes_id,
      by: l.by_double,
      source: l.source,
      createdAt: l.created_at,
      prev,
    });
    db.prepare("update intents set prev_hash = ?, hash = ? where id = ?").run(prev, hash, l.id);
    prev = hash;
    head = hash;
  }
  db.prepare("update cases set head = ?, intent_count = ? where id = ?").run(head, links.length, row.id);
  return { links: links.length, head };
}

async function addIntent(ref, intent, whenIso) {
  const res = await api("POST", `/api/v1/cases/${ref}/intents`, {
    body: intent.body,
    confidence: intent.confidence,
    evidence: intent.evidence ?? [],
    tags: intent.tags ?? [],
  });
  db.prepare("update intents set created_at = ? where id = ?").run(whenIso, res.intent.id);
  return res.intent;
}

async function main() {
  try {
    await api("POST", "/api/auth/register", ACCOUNT);
    console.log(`created @${ACCOUNT.handle}`);
  } catch (err) {
    if (!/already|taken/i.test(err.message)) throw err;
    await api("POST", "/api/auth/login", { email: ACCOUNT.email, password: ACCOUNT.password });
    console.log(`signed in to existing @${ACCOUNT.handle}`);
  }

  // ------------------------------------------------------------ case 1
  {
    const c = await api("POST", "/api/v1/cases", {
      title: "Checkout outage during Black Friday",
      kind: "incident",
      policy: "half",
      windowDays: 14,
    });
    const d = 26;
    const steps = [
      [{ body: "Roll back the 03:00 deploy before anything else — restore service first.", confidence: "high", evidence: ["error rate 14% at 03:12", "deploy at 03:04"] }, daysAgo(d, 4)],
      [{ body: "The payment provider is retrying charges and doubling traffic.", confidence: "low", tags: ["assumption"] }, daysAgo(d, 4)],
      [{ body: "Disable client-side retries behind a flag while we investigate.", confidence: "high", evidence: ["retry logs: 6 attempts/s"] }, daysAgo(d, 5)],
      [{ body: "Add exponential backoff with jitter to every client retry path.", confidence: "high", evidence: ["postmortem action 1"] }, daysAgo(d, 9)],
      [{ body: "Page on retry rate, not just error rate, from now on.", confidence: "medium", evidence: ["postmortem action 4"] }, daysAgo(d, 10)],
      // After the flag, two more decisions taken while confidence was shaken:
      // these are what carry the case past its cap. The mistake is not the
      // guess; it is making further guesses on top of a guess.
      [{ body: "Cut the retry ceiling from 6 to 2 attempts across the whole API at once.", confidence: "low", tags: ["rollout"] }, daysAgo(d, 10)],
      [{ body: "Treat the incident as closed once error rate is flat for an hour.", confidence: "low", tags: ["assumption"] }, daysAgo(d, 11)],
    ];
    for (const [intent, when] of steps) await addIntent(c.ref, intent, when);

    // Flag intent 2, then stamp the flag with a plausible time.
    await api("POST", `/api/v1/cases/${c.ref}/flag/2`, {
      reason:
        "Wrong: the retries were ours, not the provider's. Our client retried every 5xx with no backoff. The provider was never involved.",
    });
    db.prepare(
      "update intents set created_at = ? where case_id = (select id from cases where ref = ?) and body like 'Wrong:%'",
    ).run(daysAgo(d, 7), c.ref);
    db.prepare("update events set created_at = ? where case_id = (select id from cases where ref = ?)").run(daysAgo(d, 9), c.ref);

    db.prepare("update cases set created_at = ? where ref = ?").run(daysAgo(d, 3), c.ref);
    const { links } = await rechain(c.ref);
    await api("POST", `/api/v1/cases/${c.ref}/seal`, {});
    console.log(`sealed ${c.ref} (incident, ${links} links, one admitted mistake)`);
  }

  // ------------------------------------------------------------ case 2
  {
    const c = await api("POST", "/api/v1/cases", {
      title: "Q1 capacity plan",
      kind: "forecast",
      policy: "half",
      windowDays: 30,
    });
    const d = 19;
    const steps = [
      [{ body: "Provision for 2.4x current peak; growth has been 6% week over week.", confidence: "low", evidence: ["12-week growth chart"] }, daysAgo(d, 11)],
      [{ body: "Stay on the current instance class and scale horizontally first.", confidence: "high", evidence: ["cost model v3"] }, daysAgo(d, 11)],
      [{ body: "Move dashboard reads to a replica before adding compute.", confidence: "high", evidence: ["p95 query 1.8s"] }, daysAgo(d, 12)],
      [{ body: "Hold the growth projection and revisit after two releases.", confidence: "medium", evidence: ["release calendar"] }, daysAgo(d, 12)],
      // One poor quarter does not make the plan wrong. No further guesses — the
      // case settles back inside its ceiling and holds.
      [{ body: "Keep a 15% buffer unallocated rather than OpEx committed.", confidence: "high", evidence: ["finance review"] }, daysAgo(d, 13)],
    ];
    for (const [intent, when] of steps) await addIntent(c.ref, intent, when);
    db.prepare("update cases set created_at = ? where ref = ?").run(daysAgo(d, 10), c.ref);
    const { links } = await rechain(c.ref);
    await api("POST", `/api/v1/cases/${c.ref}/seal`, {});
    console.log(`sealed ${c.ref} (forecast, ${links} links, held)`);
  }

  // ------------------------------------------------------------ case 3
  {
    const c = await api("POST", "/api/v1/cases", {
      title: "Migrating auth to passkeys",
      kind: "decision",
      policy: "half",
      windowDays: 14,
    });
    const d = 5;
    const steps = [
      [{ body: "Ship passkeys as an optional second factor first, not as a replacement.", confidence: "high", evidence: ["7% of users on unsupported browsers"] }, daysAgo(d, 9)],
      [{ body: "Keep password reset untouched for this quarter.", confidence: "medium" }, daysAgo(d, 9)],
      [{ body: "Skip a pilot cohort and release to all staff at once.", confidence: "low", tags: ["assumption"] }, daysAgo(d, 9)],
    ];
    for (const [intent, when] of steps) await addIntent(c.ref, intent, when);
    db.prepare("update cases set created_at = ? where ref = ?").run(daysAgo(d, 8), c.ref);
    await rechain(c.ref);
    console.log(`opened ${c.ref} (decision, still open — 3 links)`);
  }

  db.close();

  const passport = await api("GET", `/api/v1/passport/${ACCOUNT.handle}`);
  console.log("\nsample account ready");
  console.log(`  email    : ${ACCOUNT.email}`);
  console.log(`  password : (set via PROVENANCE_SAMPLE_PASSWORD)`);
  console.log(`  passport : ${base}/p/${ACCOUNT.handle}`);
  console.log(`  stats    : ${JSON.stringify(passport.stats)}`);
  for (const c of passport.cases) console.log(`    ${c.ref} ${c.open ? "open  " : "sealed"} verified=${c.verified} slipped=${c.slipped}`);
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
