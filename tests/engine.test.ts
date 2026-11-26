import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { GENESIS } from "@/lib/chain";
import {
  appendIntent,
  DomainError,
  flagIntent,
  getCaseView,
  newCaseRef,
  normalizeRef,
  summarize,
  verifyCase,
} from "@/server/engine";
import { createMemoryStore } from "@/server/store/memory";
import type { CaseRow, Store } from "@/server/store/types";

const USER = { id: "u1", email: "ada@example.com", name: "Ada", handle: "ada", passwordHash: "x", createdAt: "2026-11-26T00:00:00.000Z" };

function newCase(policy: string): CaseRow {
  return {
    id: randomUUID(),
    ref: newCaseRef(),
    ownerId: USER.id,
    title: "Checkout relaunch",
    kind: "decision",
    policy,
    windowDays: 14,
    open: true,
    sealedAt: null,
    head: GENESIS,
    intentCount: 0,
    slippedOn: null,
    createdAt: new Date().toISOString(),
  };
}

let store: Store;

beforeEach(async () => {
  store = createMemoryStore();
  await store.insertUser(USER);
});

const add = async (row: CaseRow, body: string, confidence: "low" | "medium" | "high" = "high", supersedes?: string) => {
  const current = (await store.findCaseByRef(row.ref))!;
  return appendIntent(store, current, { body, confidence, evidence: [], tags: [], supersedes: supersedes ?? null, source: "human", byHandle: USER.handle }, USER.id);
};

describe("case lifecycle", () => {
  it("links each intent to the previous hash and verifies", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    const a = await add(row, "ship behind a flag");
    const b = await add(row, "drop address validation");
    expect(a.n).toBe(1);
    expect(b.n).toBe(2);
    const refreshed = (await store.findCaseByRef(row.ref))!;
    expect(refreshed.head).toBe(b.hash);
    expect(refreshed.intentCount).toBe(2);
    const verified = await verifyCase(store, refreshed);
    expect(verified.valid).toBe(true);
    expect(verified.checked).toBe(2);
  });

  it("refuses an empty intent", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    await expect(add(row, "   ")).rejects.toBeInstanceOf(DomainError);
  });

  it("refuses to add intents to a sealed case", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    await add(row, "first");
    await store.updateCase(row.id, { open: false });
    await expect(add(row, "too late")).rejects.toThrow(/sealed/);
  });

  it("marks an amended intent superseded and keeps the original readable", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    const first = await add(row, "original decision", "medium");
    await add(row, "revised decision", "low", String(first.n));
    const view = await getCaseView(store, (await store.findCaseByRef(row.ref))!);
    expect(view.intents[0].status).toBe("superseded");
    expect(view.intents[0].body).toBe("original decision");
    expect(view.intents[1].supersedes).toBe(first.id);
  });

  it("substitutes nothing when amending a missing intent", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    await expect(add(row, "x", "high", "99")).rejects.toThrow(/no such intent/i);
  });
});

describe("flagging and slips", () => {
  it("records a flag without inventing a slip when the case still fits its cap", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    await add(row, "client-side retries", "high");
    await add(row, "no address validation", "high");
    const current = (await store.findCaseByRef(row.ref))!;
    const flagged = await flagIntent(store, current, 1, "gateway rejects unconfirmed intents", USER.handle, USER.id);
    expect(flagged.flaggedN).toBe(1);

    const refreshed = (await store.findCaseByRef(row.ref))!;
    const view = await getCaseView(store, refreshed);
    expect(view.intents[0].status).toBe("flagged");
    // drift: +1, +1, then flag (-1.5 -1 +1) = 0.5 — inside the 3-point floor
    expect(view.slipped).toBe(false);
    expect(view.slip).toBeNull();
    expect((await verifyCase(store, refreshed)).valid).toBe(true);
  });

  it("issues a slip under the zero policy as soon as one decision is made", async () => {
    const row = newCase("zero");
    await store.insertCase(row);
    await add(row, "ship it without a fallback", "high");
    const refreshed = (await store.findCaseByRef(row.ref))!;
    const view = await getCaseView(store, refreshed);
    expect(view.slipped).toBe(true);
    expect(view.slip?.authorization).toMatch(/^PVN-/);
    expect(view.slip?.exposure_cap).toBe(0);
    expect(view.slippedOn).not.toBeNull();
  });

  it("does not issue a slip under 'half' when the case stayed inside its cap", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    await add(row, "a", "high");
    await add(row, "b", "high");
    const refreshed = (await store.findCaseByRef(row.ref))!;
    const summary = await summarize(store, refreshed);
    expect(summary.slipped).toBe(false);
    expect(summary.slip).toBeNull();
  });

  it("refuses to flag a withdrawn intent or an unknown link", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    await add(row, "a", "high");
    const current = (await store.findCaseByRef(row.ref))!;
    await expect(flagIntent(store, current, 7, "nope", USER.handle, USER.id)).rejects.toThrow(/no intent #7/);
  });
});

describe("integrity under tampering", () => {
  it("reports a break when a stored body is altered", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    await add(row, "ship it", "high");
    await add(row, "and be quick", "medium");
    const target = (await store.findCaseByRef(row.ref))!;

    const wrapped: Store = {
      ...store,
      chainRows: async (caseId) => {
        const rows = await store.chainRows(caseId);
        rows[0] = { ...rows[0], body: "ship it without review" };
        return rows;
      },
    };
    const verified = await verifyCase(wrapped, target);
    expect(verified.valid).toBe(false);
    expect(verified.brokenAt).toBe(1);
  });

  it("keeps concurrent appends on distinct link numbers", async () => {
    const row = newCase("half");
    await store.insertCase(row);
    const results = await Promise.allSettled([add(row, "one"), add(row, "two"), add(row, "three")]);
    const stored = await store.intents(row.id);
    const numbers = stored.map((r) => r.n).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(stored.length).toBe(numbers.length);
  });
});

describe("refs", () => {
  it("generates unambiguous refs and normalises them", () => {
    for (let i = 0; i < 50; i++) {
      const ref = newCaseRef();
      expect(ref).toMatch(/^PVN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(normalizeRef(ref.toLowerCase())).toBe(ref);
    }
  });
});
