import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { GENESIS } from "@/lib/chain";
import {
  AUTOPILOT_STEPS,
  nextMove,
  openingTitle,
  type AgentState,
} from "@/server/autopilot";
import { VISITOR_COOKIE } from "@/server/auth";
import { appendIntent, getCaseView, newCaseRef, nowIso, verifyCase } from "@/server/engine";
import { clientKey, errorResponse, json, rateLimit } from "@/server/http";
import { getStore } from "@/server/store";
import type { CaseRow, Store } from "@/server/store/types";


/**
 * The Autopilot demo.
 *
 * Each visitor gets their own throwaway agent case, progressed one decision per
 * call, so the UI can replay the run step by step. The visitor cookie keeps the
 * run private to that browser.
 */

const TOTAL = AUTOPILOT_STEPS;
const RUN_KIND = "autopilot";

/**
 * The visitor cookie doubles as the run's identity: its issuing timestamp is
 * baked into the value, so the run is "the latest agent case created since this
 * visitor arrived". No user row and no foreign key are involved.
 */
async function visitorId(): Promise<{ id: string; since: string }> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  const parsed = parseVisitor(existing);
  if (parsed) return parsed;
  const since = new Date().toISOString();
  const id = `${randomUUID()}.${Date.parse(since)}`;
  try {
    jar.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  } catch {
    // Ignore: read-only cookie contexts still get a fresh run per request.
  }
  return { id, since };
}

function parseVisitor(raw: string | undefined): { id: string; since: string } | null {
  if (!raw) return null;
  const [uuid, stamp] = raw.split(".");
  const ms = Number(stamp);
  if (!uuid || !Number.isFinite(ms) || ms <= 0 || ms > Date.now() + 60_000) return null;
  return { id: uuid, since: new Date(ms).toISOString() };
}

const seedFor = (visitor: string) => `ap-${visitor.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}`;

async function findRun(store: Store, since: string): Promise<CaseRow | null> {
  const row = await store.findLatestCaseByKind(RUN_KIND, since);
  return row ?? null;
}

function stateFor(seed: string, step: number): AgentState {
  return { seed, step, total: TOTAL, finished: step >= TOTAL, ref: null, lastN: null, narrative: [] };
}

export async function POST(request: Request) {
  try {
    rateLimit(clientKey(request, "autopilot"), 240, 60_000);
    const body = (await request.json().catch(() => ({}))) as { restart?: boolean };
    const store = getStore();
    const visitor = await visitorId();
    const seed = seedFor(visitor.id);

    let row = body.restart ? null : await findRun(store, visitor.since);
    if (!row) {
      row = {
        id: randomUUID(),
        ref: newCaseRef(),
        ownerId: null,
        title: openingTitle(seed),
        kind: RUN_KIND,
        policy: "half",
        windowDays: 14,
        open: true,
        sealedAt: null,
        head: GENESIS,
        intentCount: 0,
        slippedOn: null,
        createdAt: nowIso(),
      };
      await store.insertCase(row);
    }

    const step = (await store.intents(row.id)).length;
    const move = nextMove(stateFor(seed, step));
    if (!move) {
      const view = await getCaseView(store, (await store.findCaseByRef(row.ref))!);
      return json({ done: true, step, total: TOTAL, ref: view.ref, case: view, say: "Run complete." });
    }

    const current = (await store.findCaseByRef(row.ref))!;
    const target = move.kind === "intent" ? null : String(move.target);
    const appended = await appendIntent(
      store,
      current,
      { body: move.body, confidence: move.confidence, evidence: move.evidence, tags: move.tags, supersedes: target, source: "agent", byHandle: "autopilot" },
      null,
    );
    if (move.kind === "flag") {
      const flagTarget = (await store.intents(current.id)).find((r) => r.n === move.target);
      if (flagTarget) {
        await store.setIntentStatus(current.id, flagTarget.id, "flagged", {
          id: randomUUID(),
          caseId: current.id,
          actorId: null,
          type: "intent.flag",
          payload: JSON.stringify({ flagged: move.target, by: appended.n }),
          createdAt: nowIso(),
        });
      }
    }

    const updated = (await store.findCaseByRef(current.ref))!;
    const view = await getCaseView(store, updated);
    const verified = await verifyCase(store, updated);
    return json({
      done: view.intentCount >= TOTAL,
      step: view.intentCount,
      total: TOTAL,
      move: move.kind,
      say: move.say,
      case: view,
      verified: verified.valid,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET() {
  try {
    const store = getStore();
    const visitor = await visitorId();
    const row = await findRun(store, visitor.since);
    if (!row) return json({ started: false, total: TOTAL });
    const view = await getCaseView(store, row);
    return json({ started: true, done: view.intentCount >= TOTAL, step: view.intentCount, total: TOTAL, case: view });
  } catch (err) {
    return errorResponse(err);
  }
}
