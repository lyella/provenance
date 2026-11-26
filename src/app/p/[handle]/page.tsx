import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CountUp } from "@/components/motion";
import { Stamp, VerifyStamp, when } from "@/components/ledger-bits";
import { getSlipResult, summarize } from "@/server/engine";
import { getStore } from "@/server/store";

export async function generateMetadata(props: PageProps<"/p/[handle]">): Promise<Metadata> {
  const { handle } = await props.params;
  return { title: `@${handle} · Passport` };
}

interface PassportCase {
  ref: string;
  title: string;
  kind: string;
  open: boolean;
  intentCount: number;
  slipped: boolean;
  slippedOn: string | null;
  head: string;
  createdAt: string;
  sealedAt: string | null;
  verified: boolean;
  cap: number;
  drift: number;
}

async function PassportBody({ params }: Pick<PageProps<"/p/[handle]">, "params">) {
  // Slip drift is judged against the current time and the rolling window, so
  // this page renders per request; prerendering would freeze `new Date()`.
  await connection();
  const { handle } = await params;
  const store = getStore();
  const user = await store.findUserByHandle(handle.toLowerCase());
  if (!user) return <NotFoundPassport handle={handle} />;

  const rows = await store.listCasesByOwner(user.id);
  const cases: PassportCase[] = [];
  let decisions = 0;
  let slips = 0;
  let broken = 0;
  let sealed = 0;
  let flagged = 0;
  let reversals = 0;

  for (const row of rows) {
    const summary = await summarize(store, row);
    const intents = await store.intents(row.id);
    const slip = await getSlipResult(row, intents);
    decisions += intents.filter((i) => i.status !== "withdrawn").length;
    flagged += intents.filter((i) => i.status === "flagged").length;
    reversals += intents.filter((i) => i.tags.includes("flag") || i.status === "superseded").length;
    if (summary.slipped) slips += 1;
    if (!summary.verified.valid) broken += 1;
    if (!row.open) sealed += 1;
    cases.push({
      ref: row.ref,
      title: row.title,
      kind: row.kind,
      open: row.open,
      intentCount: intents.length,
      slipped: summary.slipped,
      slippedOn: summary.slippedOn,
      head: row.head,
      createdAt: row.createdAt,
      sealedAt: row.sealedAt,
      verified: summary.verified.valid,
      cap: slip.cap,
      drift: slip.drift,
    });
  }

  const slipRate = rows.length ? Math.round((slips / rows.length) * 100) : 0;

  return (
    <div>
      <section className="border-b border-ink pb-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="label">Public passport / verified by hash</p>
            <h1 className="display-hero mt-6 max-w-[14ch] !text-[clamp(2.6rem,7vw,6rem)]">{user.name}</h1>
            <p className="mt-5 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-faint">
              @{user.handle} <span aria-hidden>·</span> joined {when(user.createdAt)} <span aria-hidden>·</span>{" "}
              {rows.length} {rows.length === 1 ? "case" : "cases"}
            </p>
          </div>
          <div className="pt-2 text-right">
            {broken === 0 && rows.length > 0 ? (
              <Stamp kind="verified" animate>
                every chain verifies
              </Stamp>
            ) : broken > 0 ? (
              <Stamp kind="broken">{broken} broken chain(s)</Stamp>
            ) : (
              <Stamp kind="neutral">no cases yet</Stamp>
            )}
          </div>
        </div>
      </section>

      {/* The figures: oversized, monospaced, set like a financial statement. */}
      <dl className="grid grid-cols-2 border-b border-ink md:grid-cols-4">
        {[
          ["Decisions", decisions, "", "signed intents, including the wrong ones"],
          ["Slip rate", slipRate, "%", "cases that crossed their cap"],
          ["Reversals", reversals, "", "amendments and flags on the record"],
          ["Sealed", sealed, "", "frozen, head published"],
        ].map(([k, v, suffix, hint], i) => (
          <div
            key={String(k)}
            className={`py-7 ${i < 3 ? "md:border-r md:border-rule md:pr-6" : ""} ${i % 2 === 0 ? "border-r border-rule pr-6 md:border-r" : ""} ${i < 2 ? "border-b border-rule md:border-b-0" : ""}`}
          >
            <dt className="label label-ink">{k}</dt>
            <dd className="numeral mt-2 text-5xl sm:text-6xl">
              <CountUp to={Number(v)} suffix={String(suffix)} />
            </dd>
            <dd className="mt-2 max-w-[18ch] text-[0.72rem] leading-snug text-ink-faint">{hint}</dd>
          </div>
        ))}
      </dl>
      <p className="border-b border-rule py-3 text-xs text-ink-faint">
        Flagged decisions on record: <span className="font-mono text-ink-soft">{flagged}</span>. A high reversal count is
        not a flaw — it means mistakes were corrected on the record instead of erased.
      </p>

      {rows.length === 0 ? (
        <p className="mt-12 border-y border-rule py-14 text-center display-lg">
          A passport with no decisions on it is a blank page, not a claim.
        </p>
      ) : (
        <section className="mt-14">
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 className="label label-ink">Timeline</h2>
            <span className="label">newest first</span>
          </div>
          <ol className="divide-y divide-rule">
            {cases.map((c, i) => (
              <li key={c.ref} className="grid gap-4 py-7 md:grid-cols-[3rem_minmax(0,1fr)_9rem]">
                <span className="numeral text-sm text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-ink-faint">
                    <span>{c.ref}</span>
                    <span aria-hidden>·</span>
                    <span>{c.kind}</span>
                    {c.slipped ? <Stamp kind="slipped">slipped</Stamp> : <Stamp kind="verified">held</Stamp>}
                    {!c.open && <Stamp kind="sealed">sealed</Stamp>}
                  </div>
                  <h3 className="display-lg mt-2.5 max-w-[28ch]">{c.title}</h3>
                  <p className="mt-2.5 font-mono text-[0.66rem] text-ink-faint">
                    {c.intentCount} intents <span aria-hidden>·</span> {c.verified ? "chain intact" : "chain broken"}{" "}
                    <span aria-hidden>·</span> drift {c.drift}px{c.cap >= 0 ? ` / cap ${c.cap}px` : ""}
                    {c.slippedOn ? ` · slipped ${when(c.slippedOn)}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Link
                      className="link-underline font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
                      href={`/s/${c.ref}`}
                    >
                      Open the record
                    </Link>
                    <a
                      className="link-underline font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
                      href={`/api/v1/cases/${c.ref}/verify`}
                    >
                      Verify via API
                    </a>
                    <a
                      className="link-underline font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-soft hover:text-ink"
                      href={`/api/v1/cases/${c.ref}/export`}
                      download
                    >
                      Proof
                    </a>
                  </div>
                </div>
                <div className="md:text-right">
                  <VerifyStamp verified={{ valid: c.verified, checked: 0, brokenAt: null }} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mt-16 grid gap-6 border-t border-ink pt-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <p className="label label-ink">Why a passport, not a testimonial</p>
        <p className="max-w-[62ch] text-sm leading-relaxed text-ink-soft">
          Anybody can write <span className="em-serif">&ldquo;shipped the thing.&rdquo;</span> This record shows what was
          promised, when, at what declared confidence, and whether the promise exceeded what the decisions had earned at
          that point. The slips are part of the story on purpose — a record with no slips tells you nothing. Verify any
          entry with the{" "}
          <Link className="link-underline text-ink" href="/verify">
            in-browser verifier
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function NotFoundPassport({ handle }: { handle: string }) {
  return (
    <div className="py-24 text-center">
      <p className="label">404</p>
      <h1 className="display-xl mt-4">
        No one is trading as <span className="font-mono text-[0.72em]">@{handle}</span>
      </h1>
      <p className="mt-3 text-sm text-ink-soft">Passports appear when a person records their first case.</p>
      <Link className="btn mt-7" href="/#start">
        Open your own ledger
      </Link>
    </div>
  );
}

export default function PassportPage(props: PageProps<"/p/[handle]">) {
  return (
    <main className="shell py-12 sm:py-16">
      <Suspense fallback={<p className="label">Reading the passport…</p>}>
        <PassportBody params={props.params} />
      </Suspense>
    </main>
  );
}
