import { getCaseView, normalizeRef } from "@/server/engine";
import { HttpError, errorResponse, json, requireUser } from "@/server/http";
import { getStore } from "@/server/store";


export async function GET(_request: Request, ctx: RouteContext<"/api/v1/cases/[ref]">) {
  try {
    const user = await requireUser();
    const { ref } = await ctx.params;
    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) throw new HttpError(404, "no case with that reference");
    if (row.ownerId !== user.id) throw new HttpError(403, "this case belongs to someone else");
    return json(await getCaseView(store, row));
  } catch (err) {
    return errorResponse(err);
  }
}
