import { normalizeRef, nowIso, verifyCase } from "@/server/engine";
import { HttpError, errorResponse, json, requestOrigin, requireUser } from "@/server/http";
import { getStore } from "@/server/store";


/**
 * Sealing freezes a case: no further intents, and the head hash is published
 * together with an anchor document anyone can re-verify independently.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/cases/[ref]/seal">) {
  try {
    const user = await requireUser();
    const { ref } = await ctx.params;
    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) throw new HttpError(404, "no case with that reference");
    if (row.ownerId !== user.id) throw new HttpError(403, "only the case owner can seal it");
    if (!row.open) throw new HttpError(409, "this case is already sealed");

    const verified = await verifyCase(store, row);
    if (!verified.valid) throw new HttpError(409, "refusing to seal a case whose chain does not verify");

    const sealedAt = nowIso();
    await store.updateCase(row.id, { open: false, sealedAt });
    const origin = requestOrigin(request);
    return json({
      sealed: true,
      ref: row.ref,
      sealedAt,
      head: row.head,
      anchor: `sha256:${row.head}`,
      anchorUrl: `${origin}/v1/cases/${row.ref}/anchor`,
      verified,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
