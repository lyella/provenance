#!/usr/bin/env node
/**
 * provenance-verify — offline verification for a Provenance proof bundle.
 *
 *   node bin/provenance-verify.mjs proof.json
 *   node bin/provenance-verify.mjs https://your-app/v1/cases/PVN-XXXX-XXXX/export
 *
 * Exit code 0 when the chain verifies and matches the published head, 1 when it
 * does not. No dependencies: canonical JSON + node:crypto only, so the record
 * can be checked years after this deployment is gone.
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const GENESIS = "0".repeat(64);

function canonical(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical: non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  throw new Error(`canonical: unsupported type ${typeof value}`);
}

function intentHash(link) {
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
  return createHash("sha256").update(canonical(payload), "utf8").digest("hex");
}

const short = (h, n = 8) => String(h ?? "").slice(0, n) + "…";

async function load(target) {
  if (/^https?:\/\//.test(target)) {
    const res = await fetch(target);
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(target, "utf8"));
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: provenance-verify <proof.json | https://…/export>");
    process.exit(2);
  }

  const bundle = await load(target);
  if (!bundle?.links || !bundle.head) {
    console.error("error: not a provenance proof bundle (needs `links` and `head`)");
    process.exit(2);
  }

  console.log(`case ${bundle.ref} · ${bundle.links.length} links · head ${short(bundle.head, 12)}`);

  let prev = GENESIS;
  let failed = false;
  let firstBreak = null;

  for (const [i, raw] of bundle.links.entries()) {
    const link = { ...raw, caseRef: bundle.ref };
    const expectedN = i + 1;
    const prefix = `  link ${String(i + 1).padStart(String(bundle.links.length).length)}  #${link.n}`;

    if (link.n !== expectedN) {
      failed = true;
      firstBreak ??= link.n;
      console.log(`${prefix}  FAIL — expected link #${expectedN}`);
      continue;
    }
    if (link.prev !== prev) {
      failed = true;
      firstBreak ??= link.n;
      console.log(`${prefix}  FAIL — previous pointer does not match (expected ${short(prev)})`);
      prev = link.hash;
      continue;
    }
    const computed = intentHash(link);
    if (computed !== link.hash) {
      failed = true;
      firstBreak ??= link.n;
      console.log(`${prefix}  FAIL — content does not match recorded hash`);
      console.log(`         recorded ${short(link.hash, 16)}  computed ${short(computed, 16)}`);
      prev = link.hash;
      continue;
    }
    console.log(`${prefix}  hash ${short(link.hash)}  prev ${short(link.prev)}  ok`);
    prev = computed;
  }

  if (!failed && prev !== bundle.head) {
    failed = true;
    firstBreak = bundle.links.length;
    console.log(`  head mismatch — recorded ${short(bundle.head, 16)}  computed ${short(prev, 16)}`);
  }

  if (failed) {
    console.log(`\nBROKEN at link #${firstBreak} — this proof does not match its own history.`);
    process.exit(1);
  }

  console.log(`\nchain OK · ${bundle.links.length} links · head ${short(bundle.head, 12)}${bundle.sealed_at ? ` · sealed ${bundle.sealed_at}` : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("error:", err.message);
  process.exit(2);
});
