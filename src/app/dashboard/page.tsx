import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Stamp, VerifyStamp, when } from "@/components/ledger-bits";
import { getCaseView } from "@/server/engine";
import { currentUser } from "@/server/http";
import { getStore } from "@/server/store";

export const metadata = { title: "Your ledger" };

async function Cases() {
  const user = await currentUser();
  if (!user) redirect("/#start");
  const store = getStore();
  const rows = await store.listCasesByOwner(user.id);
  const cases = await Promise.all(rows.map((row) => getCaseView(store, row)));

  if (cases.length === 0) {
    return (
      <div className="border-y border-rule py-16 text-center">
        <p className="h-lg">Nothing has been decided yet.</p>
        <p className="mx-auto mt-3 max-w-[34ch] text-sm text-ink-soft">
          An empty ledger is a blank page, not a claim. Open a case and put something real on the record.
        </p>
        <Link className="btn mt-7" href="/c/new">
          Open your first case
        </Link>
      </div>
    );
  }

  return (
    <ol className="border-t border-ink">
      {cases.map((c, i) => (
        <li key={c.ref}>
          <Link
            href={`/c/${c.ref}`}
            className="group grid items-baseline gap-3 border-b border-rule py-6 transition-colors hover:bg-paper-deep/30 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:gap-6 md:px-2"
          >
            <span className="numeral text-sm text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-ink-faint">
                <span>{c.ref}</span>
                <span aria-hidden>·</span>
                <span>{c.kind}</span>
                {c.slipped && <Stamp kind="slipped">slipped</Stamp>}
                {!c.open && <Stamp kind="sealed">sealed</Stamp>}
              </div>
              <p className="h-lg mt-2 max-w-[30ch] group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-[6px]">
                {c.title}
              </p>
              <p className="mt-2 font-mono text-[0.66rem] text-ink-faint">
                {c.intentCount} intents · head {c.head.slice(0, 12)}…{c.sealedAt ? ` · sealed ${when(c.sealedAt)}` : ""}
              </p>
            </div>
            <div className="md:text-right">
              <VerifyStamp verified={c.verified} />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function DashboardPage() {
  return (
    <main className="shell py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink pb-4">
        <div>
          <p className="label">02 / Your ledger</p>
          <h1 className="h-xl mt-3">Cases</h1>
        </div>
        <div className="flex gap-3">
          <Link className="btn btn-ghost btn-sm" href="/verify">
            Verify a proof
          </Link>
          <Link className="btn btn-sm" href="/c/new">
            New case
          </Link>
        </div>
      </div>
      <div className="mt-10">
        <Suspense fallback={<p className="label">Reading the ledger…</p>}>
          <Cases />
        </Suspense>
      </div>
    </main>
  );
}
