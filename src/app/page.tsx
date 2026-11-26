import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AutopilotDemo } from "@/components/autopilot-demo";
import { CountUp, Reveal, SplitText } from "@/components/motion";
import { currentUser } from "@/server/http";

/* --------------------------------- start --------------------------------- */

async function StartPanel() {
  const user = await currentUser();
  if (user) {
    return (
      <div>
        <p className="label mb-3">Signed in as @{user.handle}</p>
        <p className="h-md max-w-[24ch]">Your ledger is open. Decide something worth checking.</p>
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

const CAPABILITIES = [
  {
    title: "The chain",
    body: "Every intent names its predecessor. Edit one word of history and every later hash changes.",
    tech: "SHA-256 · canonical JSON · append-only",
  },
  {
    title: "The ledger",
    body: "Confidence sets a price. A guess costs more than a conviction, so honesty is measured rather than claimed.",
    tech: "low 4 · medium 2 · high 1",
  },
  {
    title: "The slip",
    body: "Cross the allowance and the record issues a slip: the exact decision, the date, the cap. Your weakest link, in writing.",
    tech: "policy zero · headroom · unpoliced",
  },
  {
    title: "The passport",
    body: "A public record of commitment quality — including the reversals — that anyone can verify without an account.",
    tech: "verify offline · no server required",
  },
];

export default function Home() {
  return (
    <main>
      {/* ------------------------------- hero ------------------------------ */}
      <section className="shell pt-10 pb-16 sm:pt-16 sm:pb-24">
        <h1 className="h-hero max-w-[16ch]">
          <SplitText text="Decisions that" stagger={55} />
          <br />
          <SplitText text="cannot be" stagger={55} base={110} />
          <br />
          <SplitText text="quietly rewritten." stagger={55} base={220} />
        </h1>

        <p className="lede mt-10 max-w-[42ch] sm:mt-14">
          Every assumption, every commit, every “I&apos;m sure about this” — written into a hash-linked chain, priced by
          how confident you actually were.
        </p>

        <div className="mt-10 flex flex-wrap gap-3 sm:mt-12">
          <a className="btn" href="#proof">
            See it happen in 12 seconds
          </a>
          <Link className="btn btn-ghost" href="/verify">
            Verify a proof
          </Link>
        </div>
      </section>

      {/* ---------------------------- figures ----------------------------- */}
      <section className="shell pb-16 sm:pb-24">
        <dl className="grid grid-cols-2 gap-y-10 border-t border-ink pt-8 md:grid-cols-4">
          {[
            { n: 4, suffix: "×", l: "cheaper to be honest" },
            { n: 1.5, suffix: "×", l: "the cost of being wrong" },
            { n: 256, suffix: "", l: "bits per link" },
            { n: 0, suffix: "", l: "third parties trusted" },
          ].map((f, i) => (
            <div key={f.l}>
              <dd className="numeral text-[clamp(2.5rem,5vw,4rem)]">
                <CountUp to={f.n} suffix={f.suffix} decimals={f.n % 1 ? 1 : 0} />
              </dd>
              <dt className="label mt-2 max-w-[16ch]">{f.l}</dt>
              {i < 0 && null}
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------- the signal band ------------------------ */}
      <section className="band">
        <div className="shell py-16 sm:py-24">
          <p className="eyebrow mb-10">Expertise — what is on the record</p>
          <ul>
            {CAPABILITIES.map((c) => (
              <li key={c.title} className="band-rule grid gap-3 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-12">
                <h2 className="h-lg">{c.title}</h2>
                <div>
                  <p className="text-[1.0625rem] leading-relaxed text-white/95">{c.body}</p>
                  <p className="mono mt-3 text-sm text-white/70">{c.tech}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------ proof ----------------------------- */}
      <section id="proof" className="shell scroll-mt-24 py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-16">
          <div>
            <p className="eyebrow mb-6">The proof — twelve live decisions</p>
            <Reveal>
              <AutopilotDemo />
            </Reveal>
          </div>
          <div className="border-t border-ink pt-6 lg:border-t-0 lg:pt-0">
            <p className="body-copy">
              This agent is not an LLM and says so. It follows a fixed playbook, so if it slips you can re-run it and
              watch the same slip happen again.
            </p>
            <p className="body-copy mt-4">
              Anything can be an agent here. The format constrains what a decision must declare — its confidence and its
              evidence — not which model took it.
            </p>
            <p className="label mt-8 mb-3">What to watch</p>
            <ol className="space-y-2">
              {["intents chain by hash", "a flag re-prices an earlier call", "drift crosses the allowance", "the slip is issued, permanently"].map((s, i) => (
                <li key={s} className="flex gap-3 text-[0.9375rem] text-ink-soft">
                  <span className="mono text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------------------- mechanism --------------------------- */}
      <section id="mechanism" className="shell scroll-mt-24 pb-16 sm:pb-24">
        <p className="eyebrow mb-6">Mechanism — in the terminal</p>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <pre className="overflow-x-auto border border-ink p-5 text-[0.8rem] leading-relaxed sm:p-6">
            <code className="mono">{`$ provenance verify proof.json
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
          <div>
            <p className="body-copy">
              The server is not the authority. Verification reads the exported links, recomputes every hash and compares
              the head — no network call, no account.
            </p>
            <p className="body-copy mt-4">
              Anchors live at a stable URL so a record can be checked years later, even if this deployment is gone.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn btn-ghost btn-sm" href="/verify">
                Verify in the browser
              </Link>
              <Link className="btn btn-ghost btn-sm" href="/code">
                Read the format
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ start ----------------------------- */}
      <section id="start" className="bg-paper-grey">
        <div className="shell scroll-mt-24 py-16 sm:py-24">
          <p className="eyebrow mb-6">Begin — open a ledger</p>
          <div className="grid gap-12 md:grid-cols-[1.1fr_minmax(0,26rem)] md:gap-16">
            <div>
              <h2 className="h-xl max-w-[16ch]">Start with three cases of your own.</h2>
              <p className="lede mt-6 max-w-[36ch]">
                Take a real decision, declare how sure you are, and amend it the first time you learn you were wrong —
                before anyone has to flag it.
              </p>
              <ol className="mt-10 border-t border-rule">
                {[
                  ["Open a case", "Name the decision you are actually facing, and how strictly exposure is policed."],
                  ["Declare as you go", "Each intent records confidence and evidence at the moment you decided."],
                  ["Seal it", "Freeze the record, publish the head, and carry the chain with you."],
                ].map(([h, b], i) => (
                  <li key={h} className="flex gap-5 border-b border-rule py-4">
                    <span className="mono w-7 shrink-0 text-sm text-ink-faint">0{i + 1}</span>
                    <span className="body-copy">
                      <strong className="font-bold text-ink">{h}.</strong> {b}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <Suspense fallback={<div className="h-96 animate-pulse border border-rule" />}>
              <StartPanel />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
