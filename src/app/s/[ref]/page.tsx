import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CopyButton } from "@/components/case-buttons";
import { ExposureStrip, SlipCard, Stamp, VerifyStamp, when } from "@/components/ledger-bits";
import { getCaseView, getSlipResult, normalizeRef } from "@/server/engine";
import { getStore } from "@/server/store";

export async function generateMetadata(props: PageProps<"/s/[ref]">): Promise<Metadata> {
  const { ref } = await props.params;
  return { title: `Share slip · ${normalizeRef(ref)}` };
}

async function ShareBody({ params }: Pick<PageProps<"/s/[ref]">, "params">) {
  const { ref } = await params;
  const store = getStore();
  const row = await store.findCaseByRef(normalizeRef(ref));
  if (!row) notFound();
  const [view, rows] = await Promise.all([getCaseView(store, row), store.intents(row.id)]);
  const slip = await getSlipResult(row, rows);
  const newest = [...view.intents].reverse().slice(0, 24);
  const policyLabel = slip.policy === "none" ? "unpoliced" : slip.policy === "zero" ? "zero policy" : "headroom policy";

  return (
    <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-16">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule pb-3">
          <span className="font-mono text-[0.66rem] tracking-[0.16em] text-ink-faint">{view.ref}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <VerifyStamp verified={view.verified} />
            {view.slipped ? <Stamp kind="slipped" animate>slipped</Stamp> : <Stamp kind="verified">held</Stamp>}
            {!view.open && <Stamp kind="sealed">sealed {when(view.sealedAt)}</Stamp>}
          </span>
        </div>

        <header className="pt-8">
          <p className="label">
            {view.kind} · {policyLabel} · {view.intentCount} decisions
          </p>
          <h1 className="display-xl mt-4 max-w-[22ch]">{view.title}</h1>
        </header>

        <section className="mt-10 border-t border-ink pt-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="label">Running exposure</h2>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="numeral text-5xl sm:text-6xl">{slip.drift}</span>
                <span className="label">px{slip.cap >= 0 ? ` of ${slip.cap} cap` : ""}</span>
              </p>
            </div>
            <p className="max-w-[24rem] text-xs leading-relaxed text-ink-faint">
              Each decision is priced by the confidence declared when it was made. The dashed rule is the cap.
            </p>
          </div>
          <div className="mt-4">
            <ExposureStrip points={slip.series} cap={slip.cap} />
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 className="label label-ink">Decisions</h2>
            <span className="label">
              showing {Math.min(24, view.intents.length)} of {view.intents.length}
            </span>
          </div>
          <ol className="divide-y divide-rule">
            {newest.map((intent) => (
              <li key={intent.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 py-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6">
                <span className="numeral pt-1 text-right text-lg text-ink-faint">{String(intent.n).padStart(2, "0")}</span>
                <div>
                  <p
                    className={`display-md !text-[1.1rem] leading-snug sm:!text-[1.25rem] ${
                      intent.status === "flagged"
                        ? "text-alarm line-through decoration-alarm/30 decoration-1"
                        : intent.status === "superseded"
                          ? "text-ink-faint"
                          : "text-ink"
                    }`}
                  >
                    {intent.unreadable ? <em>[intent body unreadable]</em> : intent.body}
                  </p>
                  <p className="mt-2 font-mono text-[0.66rem] text-ink-faint">
                    {intent.confidence} <span aria-hidden>·</span> {intent.byDouble} <span aria-hidden>·</span>{" "}
                    {new Date(intent.createdAt).toLocaleDateString("en-GB")} <span aria-hidden>·</span>{" "}
                    <span className="text-ink-soft">{intent.hash.slice(0, 12)}</span>
                    {intent.status === "flagged" && <span className="text-alarm"> · flagged</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="space-y-8 lg:sticky lg:top-24">
        {view.slip ? (
          <SlipCard slip={view.slip} slipDetail={slip} animate />
        ) : (
          <div className="border border-verified bg-verified-soft/40 p-5">
            <span className="stamp stamp-verified">No slip</span>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              This case never asked for more trust than it had earned within its {slip.windowDays}-day window.
            </p>
          </div>
        )}

        <section className="border-t border-ink pt-4">
          <h2 className="label label-ink">Verify it yourself</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            The chain re-computes without this site — no account, no network call of ours.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <CopyButton text={view.head} label="Copy head" />
            <a
              className="link-underline font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
              href={`/api/v1/cases/${view.ref}/export`}
              download
            >
              Download proof
            </a>
            <a
              className="link-underline font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
              href={`/verify?ref=${view.ref}`}
            >
              Verify in browser
            </a>
            <a
              className="link-underline font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
              href={`/api/v1/cases/${view.ref}/anchor`}
            >
              Anchor
            </a>
          </div>
          <p className="hash mt-3 break-all text-[0.62rem] text-ink-faint">{view.head}</p>
        </section>

        <section className="border-t border-rule pt-4">
          <h2 className="label label-ink">What you are looking at</h2>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            A decision record, not a summary written afterwards. Each line was signed when it was decided, with its
            confidence and evidence recorded at that time — including the ones that turned out wrong.
          </p>
        </section>
      </aside>
    </div>
  );
}

export default function SharePage(props: PageProps<"/s/[ref]">) {
  return (
    <main className="shell py-10 sm:py-14">
      <Suspense fallback={<p className="label">Loading the record…</p>}>
        <ShareBody params={props.params} />
      </Suspense>
    </main>
  );
}
