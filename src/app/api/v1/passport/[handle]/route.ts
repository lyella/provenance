import { getSlipResult, summarize } from "@/server/engine";
import { errorResponse, json } from "@/server/http";
import { getStore } from "@/server/store";


/**
 * The Passport: a person's public record of commitment quality.
 *
 * Every number is derived from verify-passing chains, so the passport can only
 * be gamed in the one way that is not gaming at all — by taking decisions and
 * being honest about how sure you were.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/passport/[handle]">) {
  try {
    const { handle } = await ctx.params;
    const store = getStore();
    const user = await store.findUserByHandle(handle.toLowerCase());
    if (!user) return json({ error: "no such handle" }, { status: 404 });

    const rows = await store.listCasesByOwner(user.id);
    const cases = [];
    let decisions = 0;
    let weighted = 0;
    let slips = 0;
    let brokenChains = 0;
    let sealed = 0;
    let flagged = 0;

    for (const row of rows) {
      const summary = await summarize(store, row);
      const intents = await store.intents(row.id);
      const slip = await getSlipResult(row, intents);
      decisions += intents.filter((i) => i.status !== "withdrawn").length;
      flagged += intents.filter((i) => i.status === "flagged").length;
      if (summary.slipped) slips += 1;
      if (!summary.verified.valid) brokenChains += 1;
      if (!row.open) sealed += 1;
      weighted += intents.reduce((acc, i) => {
        const px = i.confidence === "low" ? 4 : i.confidence === "medium" ? 2 : 1;
        return acc + px;
      }, 0);
      cases.push({
        ref: row.ref,
        title: row.title,
        kind: row.kind,
        open: row.open,
        intentCount: intents.length,
        slipped: summary.slipped,
        head: row.head,
        createdAt: row.createdAt,
        sealedAt: row.sealedAt,
        verified: summary.verified.valid,
        slip,
      });
    }

    return json({
      handle: user.handle,
      name: user.name,
      joinedAt: user.createdAt,
      publicUrl: `/p/${user.handle}`,
      stats: {
        cases: rows.length,
        sealed,
        decisions,
        flagged,
        slips,
        slipRate: rows.length ? Math.round((slips / rows.length) * 1000) / 1000 : 0,
        exposureWeight: weighted,
        brokenChains,
        verifiedChains: rows.length - brokenChains,
      },
      cases,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
