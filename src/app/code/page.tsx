import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";

export const metadata = { title: "CLI, API and format" };

const CLI = `# verify a published case from anywhere, without an account
$ npx provenance-verify https://your-app.vercel.app/v1/cases/PVN-4K7Q-9XZ2/export

fetching 6 links…
  link 1  #1  hash 9f2c1a…  prev 000000…
  link 2  #2  hash 4d81be…  prev 9f2c1a…
  link 3  #3  hash 77ac02…  prev 4d81be…
  link 4  #4  hash 0d5e44…  prev 77ac02…
  link 5  #5  hash b2f019…  prev 0d5e44…
  link 6  #6  hash e1b093…  prev b2f019…
chain OK · 6 links · head e1b093…a17c`;

const TAMPER = `# flip one character of one intent body, then verify again
$ sed -i 's/behind a flag/behind a fence/' proof.json
$ npx provenance-verify ./proof.json

  link 1  #1  hash 9f2c1a…  ok
  link 2  #2  hash 4d81be…  FAIL — content does not match recorded hash
BREAK at link 2 · expected 4d81be…  found 9c02aa…
(links 3-6 inherit the break: their prev pointers no longer resolve)`;

const API = `# open a case
curl -s -X POST $PV/v1/cases \\
  -H "content-type: application/json" -b cookies.txt \\
  -d '{"title":"Relaunch checkout","policy":"half","windowDays":14}'

# append an intent — confidence is mandatory, evidence is a list
curl -s -X POST $PV/v1/cases/PVN-4K7Q-9XZ2/intents \\
  -H "content-type: application/json" -b cookies.txt \\
  -d '{"body":"Drop address validation","confidence":"high","evidence":["support tickets 41/wk"]}'

# the decision was wrong: flag it (charges 1.5x)
curl -s -X POST $PV/v1/cases/PVN-4K7Q-9XZ2/flag/2 \\
  -H "content-type: application/json" -b cookies.txt \\
  -d '{"reason":"gateway rejects unconfirmed intents; 6.1% orders lost"}'

# anyone, no auth
curl -s $PV/v1/cases/PVN-4K7Q-9XZ2/verify`;

const FORMAT = `hash(link) = sha256( canonical({
  v: "pv.intent/1",
  caseRef, n, body, confidence, evidence[], tags[],
  supersedes, by, source, createdAt, prev
}) )

canonical(x) = JSON with sorted keys, no whitespace, NFC strings
link[1].prev = "0" * 64        // genesis
link[i].prev = hash(link[i-1])
head          = hash(link[n])  // published at /anchor

exposure(conf) = low:4  medium:2  high:1   points
amend          = -exposure(original)
flag           = -(1.5 * exposure(original)) - flag's own price
drift          = running sum, judged inside a rolling window`;

function Block({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16 grid gap-6 border-t border-rule pt-5 md:grid-cols-[10rem_minmax(0,1fr)]">
      <div>
        <p className="label label-ink">{index}</p>
        <h2 className="display-md mt-2">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function CodePage() {
  return (
    <main className="shell py-12 sm:py-16">
      <div className="border-b border-ink pb-5">
        <p className="label">The contract / pv.intent/1</p>
        <h1 className="display-xl mt-4 max-w-[20ch]">
          Bring your own agent. <span className="em-serif">Check our work.</span>
        </h1>
        <p className="mt-5 max-w-[52ch] text-sm leading-relaxed text-ink-soft">
          Provenance is a protocol before it is a product. Anything that can POST JSON can be an agent — the format
          constrains what a decision must declare, not which model took it.
        </p>
      </div>

      <Block index="01 / Terminal" title="Verify from the terminal">
        <CopyBlock code={CLI} language="shell" />
      </Block>

      <Block index="02 / Tampering" title="Break it on purpose">
        <CopyBlock code={TAMPER} language="shell" />
        <p className="mt-3 text-xs text-ink-faint">
          Or do the same thing without a terminal:{" "}
          <Link className="link-underline text-ink" href="/verify">
            the in-browser verifier
          </Link>
          .
        </p>
      </Block>

      <Block index="03 / HTTP" title="The API">
        <CopyBlock code={API} language="shell" />
        <p className="mt-3 text-xs text-ink-faint">
          Schema:{" "}
          <Link className="link-underline text-ink" href="/api/openapi">
            /api/openapi
          </Link>
          . The typed client in <code className="font-mono">src/sdk/index.ts</code> wraps exactly these routes.
        </p>
      </Block>

      <Block index="04 / Format" title="The whole specification">
        <CopyBlock code={FORMAT} language="text" />
      </Block>

      <section className="mt-16 grid gap-8 border-t border-ink pt-6 md:grid-cols-[10rem_minmax(0,1fr)]">
        <p className="label label-ink">Engineering notes</p>
        <ul className="max-w-[64ch] space-y-3 text-sm leading-relaxed text-ink-soft">
          <li>
            Hashing runs on WebCrypto on both sides — the same{" "}
            <code className="font-mono text-[0.85em] text-ink">intentHash</code> function signs an intent on the server
            and re-checks it in your browser.
          </li>
          <li>
            Appends are serialised per case so two writers can never claim the same link number; a sealed case rejects
            writes with 409.
          </li>
          <li>
            Storage is a port: SQLite via <code className="font-mono text-[0.85em] text-ink">node:sqlite</code> with no
            native build, or an in-process store for previews.
          </li>
          <li>
            Every surface — case page, passport, RSS, API — computes exposure through one function, so they cannot
            disagree.
          </li>
        </ul>
      </section>
    </main>
  );
}
