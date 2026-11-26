#!/usr/bin/env node
/**
 * Seed a public Passport: one person, three honest cases, real chains.
 *
 *   node bin/seed.mjs
 *   node bin/seed.mjs --name "Grace Hopper" --handle grace --base http://127.0.0.1:3000
 *
 * There is no private API in the seed: it registers over HTTP and appends
 * intents exactly as the UI does, so everything it creates verifies like any
 * other record. Cases are deliberately imperfect — one holds, one slips, one is
 * still open — because a record with no slips proves nothing.
 *
 * Demo dates are backdated at the case level (created_at/sealed_at) so the
 * timeline reads naturally. Intent timestamps are part of the signed chain and
 * are never rewritten.
 */
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = flag("base", process.env.BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const NAME = flag("name", "Your Name");
const HANDLE = flag("handle", "you");
const EMAIL = flag("email", `${HANDLE}@provenance.demo`);
const PASSWORD = flag("password", "provenance-demo-password");

let cookie = "";

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("pv_session=")) cookie = c.split(";")[0];
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return json;
}

const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();

/** Cases live in the past, so slip windows and the timeline read naturally. */
async function backdateCase(ref, days) {
  const sqlite = await import("node:sqlite").catch(() => null);
  if (!sqlite) return;
  const file = process.env.PROVENANCE_DB_PATH ?? ".data/provenance.db";
  try {
    const db = new sqlite.DatabaseSync(file);
    const shift = (table) =>
      db.prepare(`UPDATE ${table} SET created_at = ? WHERE case_id = (SELECT id FROM cases WHERE ref = ?)`).run(daysAgo(days), ref);
    shift("events");
    db.prepare("UPDATE cases SET created_at = ? WHERE ref = ?").run(daysAgo(days), ref);
    db.close();
  } catch {
    // Not fatal: the seed still works, the dates are simply "now".
  }
}

async function main() {
  console.log(`Seeding ${BASE}`);
  try {
    await api("POST", "/api/auth/register", { email: EMAIL, password: PASSWORD, name: NAME, handle: HANDLE });
  } catch {
    await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  }
  console.log(`  signed in as @${HANDLE}`);

  // 1. An incident where one overconfident guess is admitted and corrected.
  {
    const c = await api("POST", "/api/v1/cases", {
      title: "Checkout outage: root cause under pressure",
      kind: "incident",
      policy: "half",
      windowDays: 14,
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Roll back the deploy first; diagnose after service is restored.",
      confidence: "high",
      evidence: ["error rate 14% at 04:12", "last deploy 03:58"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "The payment gateway is retrying failed charges and doubling traffic.",
      confidence: "low",
      evidence: [],
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Disable client-side retries behind a flag before any deeper fix.",
      confidence: "high",
      evidence: ["gateway retry logs"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/flag/2`, {
      reason: "Wrong: the retries were ours, not the gateway's. The client retried on every 5xx with no backoff.",
    });
    // Under pressure, a second guess is taken on top of the first. That is the
    // pattern the cap is for: the mistake was not the guess, it was guessing again.
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Raise the gateway timeout to 60s while the backoff rolls out.",
      confidence: "low",
      evidence: [],
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Add exponential backoff with jitter to the client retry policy.",
      confidence: "medium",
      evidence: ["postmortem action item 1"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/seal`, {});
    await backdateCase(c.ref, 40);
    console.log(`  sealed ${c.ref} (incident, one admitted mistake)`);
  }

  // 2. A forecasting case that stayed inside its allowance.
  {
    const c = await api("POST", "/api/v1/cases", {
      title: "Q1 capacity plan",
      kind: "forecast",
      policy: "half",
      windowDays: 30,
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Provision for 2.4x current peak traffic in the first quarter.",
      confidence: "low",
      evidence: ["twelve-week growth 6%/week with no sign of flattening"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Stay on the current instance class; scale horizontally first.",
      confidence: "high",
      evidence: ["cost model v3"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Move the read-heavy dashboard queries to a replica before adding nodes.",
      confidence: "high",
      evidence: ["p95 query time 1.8s"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Keep the twelve-week growth projection; revisit after the next two releases.",
      confidence: "medium",
      evidence: ["release calendar"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/seal`, {});
    await backdateCase(c.ref, 25);
    console.log(`  sealed ${c.ref} (forecast, held)`);
  }

  // 3. An open case, still being decided — with one honest gamble on the record.
  {
    const c = await api("POST", "/api/v1/cases", {
      title: "Rebuild the onboarding flow",
      kind: "decision",
      policy: "half",
      windowDays: 14,
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Replace the five-step onboarding with one screen and progressive disclosure.",
      confidence: "medium",
      evidence: ["drop-off 61% at step 3"],
    });
    await api("POST", `/api/v1/cases/${c.ref}/intents`, {
      body: "Ship to 100% of new signups rather than a cohort.",
      confidence: "low",
      evidence: [],
    });
    await backdateCase(c.ref, 6);
    console.log(`  opened ${c.ref} (decision, still open)`);
  }

  console.log(`\nPassport: ${BASE}/p/${HANDLE}`);
  console.log(`Feed:     ${BASE}/feed.xml\n`);
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
