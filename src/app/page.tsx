import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AutopilotDemo } from "@/components/autopilot-demo";
import { CountUp, Reveal, SplitText } from "@/components/motion";
import { currentUser } from "@/server/http";

/* ------------------------------- furniture ------------------------------- */

function SectionHead({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <Reveal className="grid items-baseline gap-4 border-t border-ink pt-4 md:grid-cols-[6rem_1fr_auto]">
      <span className="label label-ink">{index}</span>
      <h2 className="display-xl">{title}</h2>
      {note ? <span className="label max-w-[18rem] md:text-right">{note}</span> : <span />}
    </Reveal>
  );
}

/* --------------------------------- start --------------------------------- */

async function StartPanel() {
  const user = await currentUser();
  if (user) {
    return (
      <div className="border border-ink p-6">
        <p className="label label-ink">Signed in as @{user.handle}</p>
        <p className="display-md mt-3 max-w-[22ch]">Your ledger is open. Decide something worth checking.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn" href="/dashboard">
            My ledger
          </Link>
          <Link className="btn btn-ghost" href="/c/new">
            New case
          </Link>
        </div>
      </div>
    );
  }
  return <AuthForm />;
}

/* --------------------------------- page ---------------------------------- */

export default function Home() {
  return (
    <main>
      {/* ------------------------------ hero ------------------------------ */}
      <section className="shell pt-10 pb-16 sm:pt-16">
        <div className="flex items-start justify-between gap-6 border-b border-rule pb-4">
          <p className="label">An open format for decisions</p>
          <p className="label hidden sm:block">Est. 2026 · pv.intent/1</p>
        </div>

        <h1 className="display-hero mt-10 max-w-[16ch] sm:mt-14">
          <SplitText text="Decisions that" stagger={70} />
          <br />
          <SplitText text="cannot be" stagger={70} base={140} />
          <br />
          <span className="display-hero-accent inline-block text-signal">
            <SplitText text="quietly rewritten." stagger={70} base={280} />
          </span>
        </h1>

        <div className="mt-12 grid gap-8 border-t border-rule pt-6 md:grid-cols-[1.15fr_1fr] md:gap-16">
          <Reveal delay={120}>
            <p className="prose-lede">
              Every assumption, every commit, every <span className="em-serif">I&rsquo;m sure about this</span>{" "}
              — written into a hash-linked chain, priced by how confident you actually were, and published with a
              head hash anyone can check without trusting this site.
            </p>
          </Reveal>
          <Reveal delay={200} className="flex flex-col items-start gap-5 md:items-end">
            <div className="flex flex-wrap gap-3">
              <a className="btn" href="#proof">
                See it happen in 12 seconds
              </a>
              <Link className="btn btn-ghost" href="/code">
                <span className="font-mono">&gt; verify</span>
              </Link>
            </div>
            <p className="label md:text-right">Scroll to watch a slip get issued ↓</p>
          </Reveal>
        </div>
      </section>

      {/* --------------------------- figures band ------------------------- */}
      <section className="border-y border-ink bg-paper-deep/40">
        <div className="shell grid grid-cols-2 gap-px py-8 sm:grid-cols-4 sm:py-10">
          {[
            { n: <CountUp to={4} suffix="×" />, l: "cheaper to be honest", d: "low confidence costs four times high" },
            { n: <CountUp to={1.5} decimals={1} suffix="×" />, l: "the cost of being wrong", d: "a flagged decision is charged again" },
            { n: <CountUp to={256} />, l: "bits per link", d: "SHA-256 over canonical JSON" },
            { n: <CountUp to={0} />, l: "third parties trusted", d: "verification runs on your machine" },
          ].map((f, i) => (
            <Reveal key={f.l} delay={i * 90} className="flex flex-col gap-1 pr-4">
              <span className="numeral text-5xl sm:text-6xl">{f.n}</span>
              <span className="mt-3 text-sm font-medium tracking-tight">{f.l}</span>
              <span className="label mt-0.5 !normal-case !tracking-normal">{f.d}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------ proof ----------------------------- */}
      <section id="proof" className="shell scroll-mt-20 py-16 sm:py-24">
        <SectionHead index="01 / Proof" title="Twelve decisions. One live chain." note="Not a mock — each step is signed on the server." />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem]">
          <Reveal>
            <AutopilotDemo />
          </Reveal>
          <Reveal delay={120} className="flex flex-col justify-between gap-8">
            <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
              <p>
                This agent is not an LLM and says so. It follows a fixed playbook, so if it slips you can re-run it and
                watch the same slip happen again.
              </p>
              <p>
                Anything can be an agent here. The format constrains what a decision must{" "}
                <span className="em-serif text-ink">declare</span> — its confidence and its evidence — not which model
                took it.
              </p>
            </div>
            <div className="border-t border-rule pt-4">
              <p className="label mb-2">What to watch</p>
              <ol className="space-y-2 font-mono text-[0.72rem] leading-relaxed text-ink-soft">
                <li>01 — intents chain by hash</li>
                <li>02 — a flag re-prices an earlier call</li>
                <li>03 — drift crosses the cap</li>
                <li>04 — the slip is stamped, permanently</li>
              </ol>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------- mechanism --------------------------- */}
      <section id="mechanism" className="shell scroll-mt-20 py-16 sm:py-24">
        <SectionHead index="02 / Mechanism" title="Three rules, nothing else." note="The whole system can be read in a minute." />
        <div className="mt-10 grid gap-px border-y border-rule bg-rule md:grid-cols-3">
          {[
            {
              n: "01",
              k: "The chain",
              t: "An intent names its predecessor.",
              b: "hash = sha256(prev, n, body, confidence, evidence, tags, by, time). Change any word and every later hash changes. The head hash is the whole record, compressed.",
            },
            {
              n: "02",
              k: "The ledger",
              t: "Confidence sets the price.",
              b: "low 4 · medium 2 · high 1 exposure points. Amending refunds the original. Flagging a wrong decision costs 1.5× and then some. Drift is the running sum.",
            },
            {
              n: "03",
              k: "The slip",
              t: "Exposure has a ceiling.",
              b: "Unpoliced, zero, or a fixed allowance. Cross it and a slip is issued — the exact decision, the date, the cap. Your weakest link, in writing.",
            },
          ].map((c, i) => (
            <Reveal key={c.n} delay={i * 110} className="bg-paper p-6 sm:p-8">
              <div className="flex items-baseline justify-between">
                <span className="label label-ink">{c.k}</span>
                <span className="numeral text-2xl text-ink-faint">{c.n}</span>
              </div>
              <h3 className="display-md mt-6 max-w-[18ch]">{c.t}</h3>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">{c.b}</p>
            </Reveal>
          ))}
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Reveal className="min-w-0">
            <p className="label mb-3">In the terminal</p>
            <pre className="overflow-x-auto border border-ink bg-night p-5 text-[0.72rem] leading-relaxed text-paper sm:p-6">
              <code>{`$ provenance verify proof.json
  link 1/4  #1 prev 000000… hash 9f2c1a…   ok
  link 2/4  #2 prev 9f2c1a… hash 4d81be…   ok
  link 3/4  #3 prev 4d81be… hash 77ac02…   ok
  link 4/4  #4 prev 77ac02… hash e1b093…   ok
  chain OK · head e1b093…a17c · sealed 26 Nov

# change one word, run it again
$ provenance verify proof.json
  BREAK at link 2 · content does not match its recorded hash
  expected 4d81be…  found 0aa9d2…`}</code>
            </pre>
          </Reveal>
          <Reveal delay={120} className="flex min-w-0 flex-col justify-between gap-6">
            <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
              <p>
                The server is not the authority. Verification reads the exported links, recomputes every hash and
                compares the head — no network call, no account.
              </p>
              <p>
                Anchors live at a stable URL so a record can be checked years later, even if this deployment is gone.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="btn btn-ghost btn-sm" href="/verify">
                Verify in the browser
              </Link>
              <Link className="btn btn-ghost btn-sm" href="/code">
                Read the format
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------ start ----------------------------- */}
      <section id="start" className="shell scroll-mt-20 py-16 sm:py-24">
        <SectionHead index="03 / Begin" title="Open your ledger." note="Private by default. Published only when you seal." />
        <div className="mt-10 grid items-start gap-12 md:grid-cols-[1.1fr_1fr]">
          <Reveal className="space-y-8">
            <p className="prose-lede">
              Start with three cases of your own. Take a real decision, declare how sure you are, and amend it the
              first time you learn you were wrong — before anyone has to flag it.
            </p>
            <ol className="divide-y divide-rule border-y border-rule">
              {[
                ["Open a case", "Name the decision you are actually facing, and how strictly exposure is policed."],
                ["Declare as you go", "Each intent records confidence and evidence at the moment you decided."],
                ["Seal it", "Freeze the record, publish the head, and carry the chain with you."],
              ].map(([h, b], i) => (
                <li key={h} className="flex gap-5 py-4">
                  <span className="numeral w-8 shrink-0 text-sm text-ink-faint">0{i + 1}</span>
                  <span className="text-sm leading-relaxed text-ink-soft">
                    <strong className="font-medium text-ink">{h}.</strong> {b}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link className="link-underline font-mono text-[0.68rem] uppercase tracking-[0.14em]" href="/feed.xml">
                RSS of sealed cases
              </Link>
              <Link className="link-underline font-mono text-[0.68rem] uppercase tracking-[0.14em]" href="/api/openapi">
                OpenAPI
              </Link>
              <Link className="link-underline font-mono text-[0.68rem] uppercase tracking-[0.14em]" href="/p/shaira">
                A public passport
              </Link>
            </div>
          </Reveal>
          <Reveal delay={140}>
            <Suspense fallback={<div className="h-96 animate-pulse border border-rule bg-paper-deep/40" />}>
              <StartPanel />
            </Suspense>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
