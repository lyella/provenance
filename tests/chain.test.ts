import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonical, GENESIS, intentHash, sha256Hex, verifyChain, type IntentLink } from "@/lib/chain";

const subtle = webcrypto.subtle;

const link = (n: number, overrides: Partial<IntentLink> = {}): IntentLink => ({
  caseRef: "PVN-AAAA-AAAA",
  n,
  body: `decision ${n}`,
  confidence: "medium",
  evidence: [],
  tags: [],
  supersedes: null,
  by: "AD",
  source: "human",
  createdAt: "2026-11-26T00:00:00.000Z",
  prev: GENESIS,
  ...overrides,
});

const signed = async (l: IntentLink) => ({ ...l, hash: await intentHash(l, subtle) });

describe("canonical", () => {
  it("is independent of key order", () => {
    expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }));
    expect(canonical({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("is not confused by whitespace or line endings in strings being distinct content", () => {
    expect(canonical({ a: "x\ny" })).toBe('{"a":"x\\ny"}');
    expect(canonical({ a: "x\ny" })).not.toBe(canonical({ a: "x\r\ny" }));
  });

  it("normalises unicode so equivalent strings hash the same", () => {
    expect(canonical("e\u0301")).toBe(canonical("\u00e9"));
  });

  it("rejects values it cannot represent deterministically", () => {
    expect(() => canonical({ a: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("matches a hand-computed sha256", async () => {
    const value = { v: "pv.intent/1", prev: GENESIS };
    const manual = createHash("sha256").update(canonical(value), "utf8").digest("hex");
    expect(await sha256Hex(value, subtle)).toBe(manual);
  });
});

describe("intentHash", () => {
  it("does not include the stored hash in its own input", async () => {
    const l = link(1);
    const bare = await intentHash(l, subtle);
    const polluted = await intentHash({ ...l, hash: "f".repeat(64) } as IntentLink, subtle);
    expect(polluted).toBe(bare);
  });

  it("changes when any committed field changes", async () => {
    const base = await intentHash(link(1), subtle);
    const variants: Array<Partial<IntentLink>> = [
      { body: "decision 1!" },
      { confidence: "high" },
      { evidence: ["x"] },
      { tags: ["t"] },
      { by: "BE" },
      { source: "agent" },
      { createdAt: "2026-11-26T00:00:00.001Z" },
      { prev: "f".repeat(64) },
      { caseRef: "PVN-BBBB-BBBB" },
    ];
    for (const v of variants) {
      expect(await intentHash(link(1, v), subtle)).not.toBe(base);
    }
  });
});

describe("verifyChain", () => {
  it("accepts an intact chain", async () => {
    const a = await signed(link(1));
    const b = await signed(link(2, { prev: a.hash }));
    const c = await signed(link(3, { prev: b.hash }));
    const result = await verifyChain([a, b, c], subtle);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(3);
    expect(result.computedHead).toBe(c.hash);
  });

  it("ignores line endings introduced by a transport, but not content", async () => {
    const a = await signed(link(1));
    const reencoded = { ...a, body: a.body };
    expect((await verifyChain([reencoded], subtle)).valid).toBe(true);
  });

  it("catches an edited body and reports the first broken link", async () => {
    const a = await signed(link(1));
    const b = await signed(link(2, { prev: a.hash }));
    const c = await signed(link(3, { prev: b.hash }));
    const tampered = [{ ...a }, { ...b, body: "a lie" }, c];
    const result = await verifyChain(tampered, subtle);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.checked).toBe(1);
  });

  it("catches a deleted link", async () => {
    const a = await signed(link(1));
    const b = await signed(link(2, { prev: a.hash }));
    const c = await signed(link(3, { prev: b.hash }));
    const result = await verifyChain([a, c], subtle);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it("catches reordering", async () => {
    const a = await signed(link(1));
    const b = await signed(link(2, { prev: a.hash }));
    const result = await verifyChain([b, a], subtle);
    expect(result.valid).toBe(false);
  });

  it("catches a rewritten predecessor pointer", async () => {
    const a = await signed(link(1));
    const b = await signed(link(2, { prev: a.hash }));
    const forged = await intentHash(b, subtle);
    const result = await verifyChain([{ ...a, prev: "e".repeat(64), hash: forged }, b], subtle);
    expect(result.valid).toBe(false);
  });

  it("rejects a chain whose head does not match a published head", async () => {
    const a = await signed(link(1));
    const result = await verifyChain([a], subtle, "f".repeat(64));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/head/);
  });

  it("treats an empty chain as valid with the genesis head", async () => {
    const result = await verifyChain([], subtle);
    expect(result.valid).toBe(true);
    expect(result.computedHead).toBe(GENESIS);
  });
});
