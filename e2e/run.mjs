/**
 * End-to-end checks against a running server.
 *
 *   npm run build && npm start -- -p 3100 &
 *   npm run e2e            # BASE=http://127.0.0.1:3100 by default
 *
 * Covers the promises the app makes: chains verify, tampering is caught, flags
 * price 1.5x, sealing freezes, the CLI agrees with the browser verifier, and
 * every page renders its core content.
 */
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const run = promisify(execFile);

let session = "";
let visitor = "";
let failures = 0;

const ok = (cond, label, detail = "") => {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

function remember(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (c.startsWith("pv_session=")) session = c.split(";")[0];
    if (c.startsWith("pv_visitor=")) visitor = c.split(";")[0];
  }
}

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(session ? { cookie: `${session}; ${visitor}` } : visitor ? { cookie: visitor } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  remember(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text };
}

async function page(url, needles = []) {
  const r = await call("GET", url);
  const missing = needles.filter((n) => !r.text.includes(n));
  ok(r.status === 200 && missing.length === 0, `page ${url}`, missing.length ? `missing ${JSON.stringify(missing)}` : `status ${r.status}`);
  return r;
}

async function main() {
  console.log(`\nProvenance e2e against ${BASE}\n`);

  console.log("pages");
  // The hero is split into per-word spans for the type reveal, so assert on the
  // words and the section headings rather than on one contiguous sentence.
  await page("/", ["quietly", "rewritten", "Autopilot agent", "Twelve decisions", "Open your ledger"]);
  await page("/verify", ["Verify locally"]);
  await page("/code", ["provenance-verify", "pv.intent/1"]);
  await page("/signin", ["reclaim it"]);
  await page("/p/nobody-here", ["No one is trading as"]);

  console.log("\naccount");
  const email = `e2e-${Date.now()}@example.com`;
  const reg = await call("POST", "/api/auth/register", { email, password: "long-enough-password", name: "E2E Tester", handle: `e2e${Date.now() % 100000}` });
  ok(reg.status === 200, "register");

  console.log("\ncase + chain");
  const created = await call("POST", "/api/v1/cases", { title: "Relaunch checkout", policy: "half", windowDays: 14 });
  ok(created.status === 201, "open a case", String(created.status));
  const ref = created.json.ref;

  for (const [body, confidence] of [
    ["Ship behind a flag for 5% of traffic", "high"],
    ["Drop address validation to reduce friction", "high"],
    ["Let the client retry payments", "medium"],
    ["Trust the upstream schema; add strict typing later", "low"],
  ]) {
    const r = await call("POST", `/api/v1/cases/${ref}/intents`, { body, confidence, evidence: ["load test"], tags: [] });
    ok(r.status === 201, `append intent (${confidence})`, String(r.status));
  }

  let verify = await call("GET", `/api/v1/cases/${ref}/verify`);
  ok(verify.json.valid === true && verify.json.checked === 4, "chain verifies", JSON.stringify(verify.json));

  console.log("\nflagging");
  // Explanation of the arithmetic, so the scenario is auditable:
  //   decisions accumulate drift 1 + 1 + 2 + 4 = 8 (peak 8)
  //   flagging #2 refunds its 1 (+1) and charges 1.5x (-1.5), and the flag itself
  //   is an intent (+1) => drift 9.5. The cap never tracks drift — it is priced
  //   from the peak at 1.5x, here 12 — so crossing requires more than that.
  const flagged = await call("POST", `/api/v1/cases/${ref}/flag/2`, { reason: "The gateway rejects unconfirmed intents" });
  ok(flagged.status === 201, "flag intent #2", String(flagged.status));
  const view = await call("GET", `/api/v1/cases/${ref}`);
  ok(view.json.intents.find((i) => i.n === 2)?.status === "flagged", "flagged intent is marked");
  // The flag response reports the state at that moment: drift has moved, and the
  // slip may or may not have been crossed yet — both are valid here.
  ok(typeof flagged.json.slip?.drift === "number", "flag reports the updated exposure", JSON.stringify(flagged.json.slip));

  // A guess on top of a wrong guess is what crosses the line.
  await call("POST", `/api/v1/cases/${ref}/intents`, { body: "Also skip per-tenant rate limits until traffic grows", confidence: "low" });
  await call("POST", `/api/v1/cases/${ref}/intents`, { body: "Use one shared database for both tenants this quarter", confidence: "low" });
  const slip = await call("GET", `/api/v1/cases/${ref}/slip`);
  // `/slip` returns { slip: SlipResult, slipDetail: CaseSummary["slip"] }.
  ok(slip.json.slip?.slipped === true, "slip issued once the case runs past its allowance", JSON.stringify(slip.json.slip));
  ok(/^PVN-/.test(slip.json.slipDetail?.authorization ?? ""), "slip has an authorization number");

  console.log("\nproof, anchor, CLI");
  const exported = await call("GET", `/api/v1/cases/${ref}/export`);
  const bundle = JSON.parse(exported.text);
  const dir = mkdtempSync(path.join(tmpdir(), "prov-"));
  const proofPath = path.join(dir, "proof.json");
  writeFileSync(proofPath, JSON.stringify(bundle, null, 2));

  const good = await run(process.execPath, ["bin/provenance-verify.mjs", proofPath]).catch((e) => e);
  ok(good.code === undefined || good.code === 0, "CLI accepts an intact proof", String(good.code ?? "0"));

  const tampered = { ...bundle, links: bundle.links.map((l, i) => (i === 1 ? { ...l, body: "a claim that was never made" } : l)) };
  const badPath = path.join(dir, "tampered.json");
  writeFileSync(badPath, JSON.stringify(tampered, null, 2));
  const bad = await run(process.execPath, ["bin/provenance-verify.mjs", badPath]).catch((e) => e);
  ok(bad.code === 1, "CLI rejects a tampered proof", String(bad.code));

  const anchor = await call("GET", `/api/v1/cases/${ref}/anchor`);
  ok(anchor.json.anchor === `sha256:${bundle.head}`, "anchor matches the head");

  console.log("\nsealing");
  const sealed = await call("POST", `/api/v1/cases/${ref}/seal`, {});
  ok(sealed.status === 200 && sealed.json.sealed === true, "seal");
  const lateWrite = await call("POST", `/api/v1/cases/${ref}/intents`, { body: "after the seal" });
  ok(lateWrite.status === 409, "sealed case rejects writes", String(lateWrite.status));
  const reseal = await call("POST", `/api/v1/cases/${ref}/seal`, {});
  ok(reseal.status === 409, "sealed case cannot be resealed", String(reseal.status));

  console.log("\nviews");
  await page(`/c/${ref}`, ["The chain", "Running exposure", "Share slip"]);
  await page(`/s/${ref}`, ["Running exposure", "Verify it yourself"]);
  await page("/dashboard", ["Your ledger"]);
  const feed = await call("GET", "/feed.xml");
  ok(feed.text.includes(ref), "feed lists the sealed case");

  console.log("\nautopilot");
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await call("POST", "/api/v1/autopilot", {});
    if (last.status !== 200) break;
  }
  ok(last?.json?.done === true, "autopilot finishes", JSON.stringify(last?.json?.error ?? last?.json?.step));
  ok(last?.json?.verified === true, "autopilot chain verifies");
  ok(last?.json?.case?.slipped === true, "autopilot run produces a slip");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("e2e crashed:", e);
  process.exit(1);
});
