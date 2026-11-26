import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CaseShell } from "@/components/case-shell";
import { getCaseView, getSlipResult, normalizeRef } from "@/server/engine";
import { currentUser } from "@/server/http";
import { getStore } from "@/server/store";

export async function generateMetadata(props: PageProps<"/c/[ref]">): Promise<Metadata> {
  const { ref } = await props.params;
  return { title: `Case ${normalizeRef(ref)}` };
}

async function CaseBody({ params }: Pick<PageProps<"/c/[ref]">, "params">) {
  const user = await currentUser();
  if (!user) redirect("/#start");
  const { ref } = await params;
  const store = getStore();
  const row = await store.findCaseByRef(normalizeRef(ref));
  if (!row) notFound();
  if (row.ownerId !== user.id) redirect(`/s/${row.ref}`);

  const [view, rows] = await Promise.all([getCaseView(store, row), store.intents(row.id)]);
  const slip = await getSlipResult(row, rows);
  return <CaseShell initial={view} slip={slip} canEdit origin={process.env.PROVENANCE_ORIGIN ?? ""} />;
}

export default function CasePage(props: PageProps<"/c/[ref]">) {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <Suspense fallback={<p className="label">Opening the case…</p>}>
        <CaseBody params={props.params} />
      </Suspense>
    </main>
  );
}
