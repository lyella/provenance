import { analyze, DomainError, normalizeRef } from "@/server/engine";
import { HttpError, errorResponse, json, readJson, requireUser } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";
import { parse } from "@/server/validation";


const FlagBody = z.object({ reason: z.string().trim().min(3, "say what went wrong").max(2000) });

export async function POST(request: Request, ctx: RouteContext<"/api/v1/cases/[ref]/flag/[n]">) {
  try {
    const user = await requireUser();
    const { ref, n } = await ctx.params;
    const targetN = Number(n);
    if (!Number.isInteger(targetN) || targetN < 1) throw new HttpError(422, "flag target must be an intent number");
    const { reason } = parse(FlagBody, await readJson(request));

    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) throw new HttpError(404, "no case with that reference");
    if (row.ownerId !== user.id) throw new HttpError(403, "only the case owner can flag intents");
    if (!row.open) throw new HttpError(409, "this case is sealed");

    const rows = await store.intents(row.id);
    const target = rows.find((r) => r.n === targetN);
    if (!target) throw new HttpError(404, `there is no intent #${targetN} in this case`);
    if (target.status === "withdrawn") throw new HttpError(422, "cannot flag a withdrawn intent");

    // The flag is itself a signed intent that supersedes the target.
    const { appendIntent } = await import("@/server/engine");
    const intent = await appendIntent(
      store,
      row,
      { body: reason, confidence: "high", evidence: [], tags: ["flag"], supersedes: String(targetN), source: "human", byHandle: user.handle },
      user.id,
    );
    await store.setIntentStatus(row.id, target.id, "flagged", {
      id: crypto.randomUUID(),
      caseId: row.id,
      actorId: user.id,
      type: "intent.flag",
      payload: JSON.stringify({ flagged: targetN, by: intent.n }),
      createdAt: new Date().toISOString(),
    });

    const updated = (await store.findCaseByRef(normalizeRef(ref)))!;
    const after = await store.intents(updated.id);
    const { slip } = analyze(updated, after, new Date());
    return json(
      {
        intent,
        flagged: targetN,
        slip: {
          slipped: slip.slipped,
          on: slip.on,
          cap: slip.cap,
          drift: slip.drift,
          price: "a flagged decision costs 1.5x its confidence",
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof DomainError) return errorResponse(new HttpError(err.status, err.message));
    if (err instanceof Error && (err as Error & { status?: number }).status === 422) {
      return errorResponse(new HttpError(422, err.message));
    }
    return errorResponse(err);
  }
}
