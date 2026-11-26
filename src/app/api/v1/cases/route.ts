import { randomUUID } from "node:crypto";
import { GENESIS } from "@/lib/chain";
import type { CaseView } from "@/lib/types";
import { getCaseView, newCaseRef, nowIso } from "@/server/engine";
import { errorResponse, json, readJson, requireUser } from "@/server/http";
import { getStore } from "@/server/store";
import type { CaseRow } from "@/server/store/types";
import { CreateCaseBody, parse } from "@/server/validation";


export async function GET() {
  try {
    const user = await requireUser();
    const store = getStore();
    const rows = await store.listCasesByOwner(user.id);
    const views = await Promise.all(rows.map((row) => getCaseView(store, row)));
    const summaries = views.map((view) => {
      const clone: Partial<CaseView> = { ...view };
      delete clone.intents;
      return clone;
    });
    return json({ cases: summaries });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = parse(CreateCaseBody, await readJson(request));
    const store = getStore();

    const id = randomUUID();
    const row: CaseRow = {
      id,
      ref: newCaseRef(),
      ownerId: user.id,
      title: body.title,
      kind: body.kind,
      policy: body.policy,
      windowDays: body.windowDays,
      open: true,
      sealedAt: null,
      head: GENESIS,
      intentCount: 0,
      slippedOn: null,
      createdAt: nowIso(),
    };
    await store.insertCase(row);
    const view: CaseView = await getCaseView(store, row);
    return json(view, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
