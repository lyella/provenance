import { getSlipResult, normalizeRef, summarize, verifyCase } from "@/server/engine";
import { errorResponse, json } from "@/server/http";
import { getStore } from "@/server/store";


/** A Share Slip: the public, signed-in-advance record that a case slipped. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/cases/[ref]/slip">) {
  try {
    const { ref } = await ctx.params;
    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) return json({ error: "no case with that reference" }, { status: 404 });
    const intents = await store.intents(row.id);
    const slip = await getSlipResult(row, intents);
    const summary = await summarize(store, row);
    const verified = await verifyCase(store, row);
    return json({ ref: row.ref, title: row.title, slip, slipDetail: summary.slip, verified });
  } catch (err) {
    return errorResponse(err);
  }
}
