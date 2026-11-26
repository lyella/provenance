import { normalizeRef } from "@/server/engine";
import { HttpError, errorResponse, requestOrigin } from "@/server/http";
import { getStore } from "@/server/store";


/**
 * The verification bundle: every link with its recorded hash and the head.
 * This is the document the CLI verifies offline — nothing here asks the reader
 * to trust the server, which is the point.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/cases/[ref]/export">) {
  try {
    const { ref } = await ctx.params;
    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) throw new HttpError(404, "no case with that reference");

    const chain = await store.chainRows(row.id);
    const origin = requestOrigin(request);
    const bundle = {
      protocol: "pv.intent/1",
      ref: row.ref,
      title: row.title,
      kind: row.kind,
      policy: row.policy,
      window_days: row.windowDays,
      head: row.head,
      sealed_at: row.sealedAt,
      exported_at: new Date().toISOString(),
      anchor_url: `${origin}/v1/cases/${row.ref}/anchor`,
      links: chain.map((r) => ({
        n: r.n,
        prev: r.prevHash,
        hash: r.hash,
        body: r.body,
        confidence: r.confidence,
        evidence: safeArray(r.evidence),
        tags: safeArray(r.tags),
        supersedes: r.supersedesId,
        by: r.byDouble,
        source: r.source,
        createdAt: r.createdAt,
      })),
    };
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${row.ref}-proof.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function safeArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
