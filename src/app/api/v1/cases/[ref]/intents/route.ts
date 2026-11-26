import { appendIntent, DomainError, normalizeRef } from "@/server/engine";
import { HttpError, errorResponse, json, readJson, requireUser } from "@/server/http";
import { getStore } from "@/server/store";
import { IntentBody, parse } from "@/server/validation";


export async function POST(request: Request, ctx: RouteContext<"/api/v1/cases/[ref]/intents">) {
  try {
    const user = await requireUser();
    const { ref } = await ctx.params;
    const input = parse(IntentBody, await readJson(request));
    const store = getStore();
    const row = await store.findCaseByRef(normalizeRef(ref));
    if (!row) throw new HttpError(404, "no case with that reference");
    if (row.ownerId !== user.id) throw new HttpError(403, "only the case owner can add intents");

    const intent = await appendIntent(
      store,
      row,
      {
        body: input.body,
        confidence: input.confidence,
        evidence: input.evidence,
        tags: input.tags,
        supersedes: input.supersedes === null || input.supersedes === undefined ? null : String(input.supersedes),
        source: "human",
        byHandle: user.handle,
      },
      user.id,
    );
    return json({ intent }, { status: 201 });
  } catch (err) {
    return err instanceof DomainError
      ? errorResponse(new HttpError(err.status, err.message))
      : errorResponse(err);
  }
}
