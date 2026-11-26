"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { CaseView, Confidence, SlipResult } from "@/lib/types";
import { CopyButton, FlagButton, SealButton } from "@/components/case-buttons";
import { IntentComposer } from "@/components/intent-composer";
import { ExposureStrip, SlipCard, Stamp, VerifyStamp, when } from "@/components/ledger-bits";

const PAGE = 40;

const CONF_META: Record<Confidence, { label: string; px: number; width: number }> = {
  low: { label: "low", px: 4, width: 18 },
  medium: { label: "medium", px: 2, width: 9 },
  high: { label: "high", px: 1, width: 5 },
};

interface OptimisticIntent {
  body: string;
  confidence: Confidence;
  amendingN: number | null;
  submittedAt: number;
}

/**
 * The workspace. Server data drives everything; this shell adds local feedback
 * only — an intent appears the moment it is submitted (optimistic) and is
 * replaced by the signed version when the server answers.
 */
export function CaseShell({
  initial,
  slip,
  canEdit,
  origin,
}: {
  initial: CaseView;
  slip: SlipResult;
  canEdit: boolean;
  origin: string;
}) {
  const router = useRouter();
  const view = initial;
  const [amending, setAmending] = useState<{ n: number; body: string } | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [, startRefresh] = useTransition();

  const [pendingIntent, setPendingIntent] = useState<OptimisticIntent | null>(null);
  const pendingAlreadyLanded =
    pendingIntent !== null &&
    view.intents.some(
      (i) => i.body === pendingIntent.body && Math.abs(Date.parse(i.createdAt) - pendingIntent.submittedAt) < 60_000,
    );
  const isSigning = pendingIntent !== null && !pendingAlreadyLanded;

  const ordered = useMemo(() => [...view.intents].reverse(), [view.intents]);
  const visible = ordered.slice(0, shown);
  const policyLabel =
    slip.policy === "zero" ? "zero" : slip.policy === "half" ? "headroom" : "unpoliced";

  function refresh() {
    startRefresh(() => router.refresh());
  }

  function commit(optimisticIntent: { body: string; confidence: Confidence; amendingN: number | null }) {
    setPendingIntent({ ...optimisticIntent, submittedAt: Date.now() });
    refresh();
  }

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:gap-14">
      {/* ------------------------------- main ------------------------------ */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
          <Link href="/dashboard" className="link-underline font-mono text-[0.66rem] uppercase tracking-[0.16em] text-ink-faint">
            ← All cases
          </Link>
          <span className="font-mono text-[0.66rem] tracking-[0.16em] text-ink-faint">{view.ref}</span>
        </div>

        <header className="pt-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label label-ink capitalize">{view.kind}</span>
            <span className="text-ink-faint" aria-hidden>
              /
            </span>
            <span className="label">
              {policyLabel} policy · {slip.windowDays === 0 ? "all time" : `${slip.windowDays}d window`}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <VerifyStamp verified={view.verified} />
              {view.slipped && <Stamp kind="slipped" animate>slipped</Stamp>}
              {!view.open && <Stamp kind="sealed">sealed {when(view.sealedAt)}</Stamp>}
            </span>
          </div>
          <h1 className="display-xl mt-4 max-w-[24ch]">{view.title}</h1>
        </header>

        {/* Exposure: big number, then the strip. */}
        <section className="mt-10 border-t border-ink pt-5" aria-labelledby="exposure-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="exposure-title" className="label">
                Running exposure
              </h2>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="numeral text-5xl sm:text-6xl">{slip.drift}</span>
                <span className="label">
                  px{slip.cap >= 0 ? ` of ${slip.cap} cap` : " · unpoliced"}
                </span>
              </p>
            </div>
            <p className="max-w-[26rem] text-xs leading-relaxed text-ink-faint">
              Drift is the running sum of confidence-priced decisions, less amendments. The dashed line is the cap the
              policy allows.
            </p>
          </div>
          <div className="mt-4">
            <ExposureStrip points={slip.series} cap={slip.cap} />
          </div>
        </section>

        {/* The chain. */}
        <section className="mt-12" aria-labelledby="chain-title">
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 id="chain-title" className="label label-ink">
              The chain
            </h2>
            <span className="label">{view.intentCount} intents · newest first</span>
          </div>

          {ordered.length === 0 && (
            <p className="py-10 text-sm text-ink-faint">
              No decisions yet. The first one is the one you will regret — or the one that holds.
            </p>
          )}

          <ol className="divide-y divide-rule">
            {isSigning && pendingIntent && (
              <li className="row-in grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 py-4 pl-4 opacity-50 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6">
                <span className="numeral pt-1 text-right text-lg text-ink-faint">
                  {String(view.intentCount + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="display-md !text-[1.2rem] leading-snug sm:!text-[1.35rem]">{pendingIntent.body}</p>
                  <p className="mt-2 font-mono text-[0.66rem] text-ink-faint">
                    {pendingIntent.amendingN ? `amending #${pendingIntent.amendingN} · ` : ""}signing…
                  </p>
                </div>
              </li>
            )}

            {visible.map((intent) => (
              <li
                key={intent.id}
                className="row-in grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-l-2 border-transparent py-4 pl-4 transition-colors hover:border-ink hover:bg-paper-deep/30 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6"
                style={intent.status === "flagged" ? { borderLeftColor: "var(--signal)" } : undefined}
              >
                <span className="numeral pt-1 text-right text-lg text-ink-faint">{String(intent.n).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <p
                    className={`display-md !text-[1.2rem] leading-snug sm:!text-[1.35rem] ${
                      intent.status === "flagged"
                        ? "text-alarm line-through decoration-alarm/30 decoration-1"
                        : intent.status === "superseded" || intent.status === "withdrawn"
                          ? "text-ink-faint"
                          : "text-ink"
                    }`}
                  >
                    {intent.unreadable ? <em>[intent body unreadable — hash intact]</em> : intent.body}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[0.66rem] text-ink-faint">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="inline-block h-[7px] bg-ink" style={{ width: CONF_META[intent.confidence].width }} />
                      <span>{CONF_META[intent.confidence].label}</span>
                      <span>· {CONF_META[intent.confidence].px}px</span>
                    </span>
                    <span aria-hidden>·</span>
                    <span>◧ {intent.byDouble}</span>
                    <span aria-hidden>·</span>
                    <span>{intent.source}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={intent.createdAt}>
                      {new Date(intent.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                    {intent.status === "flagged" && <span className="font-medium text-alarm">flagged</span>}
                    {intent.status === "superseded" && <span>amended later</span>}
                    {intent.tags.includes("flag") && <span className="text-alarm">flag</span>}
                    <span aria-hidden>·</span>
                    <span className="text-ink-soft" title={intent.hash}>
                      {intent.hash.slice(0, 12)}
                    </span>
                  </div>
                  {intent.evidence.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {intent.evidence.map((e) => (
                        <li key={e} className="border border-rule bg-paper px-2 py-0.5 font-mono text-[0.62rem] text-ink-soft">
                          {e}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit && view.open && intent.status !== "withdrawn" && !intent.tags.includes("flag") && (
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      {intent.status !== "flagged" && (
                        <button
                          className="link-underline font-mono text-[0.66rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
                          onClick={() => setAmending({ n: intent.n, body: intent.body })}
                        >
                          Amend
                        </button>
                      )}
                      <FlagButton caseRef={view.ref} n={intent.n} onCommitted={refresh} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {ordered.length > shown && (
            <button className="btn btn-ghost mt-6 w-full" onClick={() => setShown((s) => s + PAGE * 2)}>
              Show earlier decisions ({ordered.length - shown})
            </button>
          )}

          {canEdit && view.open && ordered.length > 0 && (
            <p className="mt-10 max-w-[46ch] border-t border-rule pt-4 text-sm leading-relaxed text-ink-soft">
              <span className="em-serif text-ink">Two decisions is still an empty page.</span> A record earns attention
              by length and by honesty — keep going until the case has enough on it to be worth reading.
            </p>
          )}
        </section>
      </div>

      {/* ------------------------------- aside ----------------------------- */}
      <aside className="space-y-8 lg:sticky lg:top-24">
        {view.slip && <SlipCard slip={view.slip} slipDetail={slip} animate />}

        {canEdit ? (
          <IntentComposer
            caseRef={view.ref}
            nextN={view.intentCount + 1}
            amending={amending}
            onAmendChange={setAmending}
            onCommitted={commit}
            open={view.open}
          />
        ) : (
          <p className="border border-rule p-4 text-sm text-ink-soft">Read-only: you are not this case&rsquo;s owner.</p>
        )}

        <section className="border-t border-ink pt-4">
          <h2 className="label label-ink">Chain head</h2>
          <p className="hash mt-2 break-all text-ink">{view.head}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <CopyButton text={view.head} label="Copy head" />
            <a
              className="link-underline font-mono text-[0.66rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
              href={`/api/v1/cases/${view.ref}/export`}
              download
            >
              Download proof
            </a>
            <Link className="link-underline font-mono text-[0.66rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink" href={`/verify?ref=${view.ref}`}>
              Verify offline
            </Link>
            <Link className="link-underline font-mono text-[0.66rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink" href={`/s/${view.ref}`}>
              Share view
            </Link>
          </div>
          {origin && (
            <p className="mt-3 break-all font-mono text-[0.62rem] text-ink-faint">
              {origin}/c/{view.ref}
            </p>
          )}
        </section>

        {canEdit && view.open && (
          <section>
            <SealButton caseRef={view.ref} onSealed={refresh} />
            <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-faint">
              Sealing freezes the chain and publishes its head to the feed. A case cannot be unsealed.
            </p>
          </section>
        )}

        <PolicyCard slip={slip} kind={view.kind} />
      </aside>
    </div>
  );
}

function PolicyCard({ slip, kind }: { slip: SlipResult; kind: string }) {
  const label = slip.policy === "zero" ? "zero open drift" : slip.policy === "half" ? "headroom policy" : "not policed";
  return (
    <section className="border-t border-rule pt-4 text-xs leading-relaxed text-ink-soft">
      <h2 className="label label-ink mb-2">Policy</h2>
      <p>
        <strong className="font-medium capitalize text-ink">{kind}</strong> · {label} · rolling{" "}
        {slip.windowDays === 0 ? "all time" : `${slip.windowDays} days`}
      </p>
      <p className="mt-2 text-ink-faint">
        A decision declared <em className="em-serif">low</em> costs 4 points, <em className="em-serif">medium</em> 2,{" "}
        <em className="em-serif">high</em> 1. Amending refunds the original; flagging charges 1.5×.
      </p>
    </section>
  );
}
