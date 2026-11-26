import { normalizeRef, verifyCase } from "@/server/engine";
import { HttpError, errorResponse, json } from "@/server/http";
import { getStore } from "@/server/store";


/** Public: anyone holding the reference can ask the server to re-verify. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/cases/[ref]/verify">) {
  try {
    const { ref } = await ctx.params;
    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) throw new HttpError(404, "no case with that reference");
    return json(await verifyCase(store, row));
  } catch (err) {
    return errorResponse(err);
  }
}
