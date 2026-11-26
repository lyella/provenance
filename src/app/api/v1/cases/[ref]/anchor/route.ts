import { normalizeRef, verifyCase } from "@/server/engine";
import { HttpError, errorResponse, json } from "@/server/http";
import { getStore } from "@/server/store";


/**
 * A self-contained anchor document: the head, the verification result, and
 * instructions a third party can follow without trusting this deployment.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/cases/[ref]/anchor">) {
  try {
    const { ref } = await ctx.params;
    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) throw new HttpError(404, "no case with that reference");
    const verified = await verifyCase(store, row);
    const origin = new URL(request.url).origin;
    return json({
      protocol: "pv.intent/1",
      ref: row.ref,
      head: row.head,
      anchor: `sha256:${row.head}`,
      intentCount: row.intentCount,
      sealedAt: row.sealedAt,
      verifiedAt: new Date().toISOString(),
      verified,
      howToVerify: [
        "Fetch /v1/cases/<ref>/export to get every link with its recorded hash.",
        "For each link, canonicalise the intent fields with sorted keys and no whitespace.",
        "Hash sha256(JSON) of {v:'pv.intent/1', caseRef, n, body, confidence, evidence, tags, supersedes, by, source, createdAt, prev}.",
        "Confirm each link's hash equals the next link's prev, the first prev is 64 zeros, and the last hash equals this head.",
      ],
      exportUrl: `${origin}/v1/cases/${row.ref}/export`,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
