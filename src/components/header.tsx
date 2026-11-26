import Link from "next/link";
import { Suspense } from "react";
import { MastheadNav } from "@/components/masthead-nav";
import { SessionMenu } from "@/components/session-menu";
import { currentUser } from "@/server/http";

async function WhoAmI() {
  const user = await currentUser();
  return <SessionMenu user={user ? { name: user.name, handle: user.handle } : null} />;
}

/**
 * The masthead: wordmark, an index of the three ideas the site is built on, and
 * the one action that matters. It stays thin so the type below carries the page.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/80 backdrop-blur-md">
      <div className="shell flex h-14 items-center justify-between gap-6 sm:h-16">
        <Link href="/" className="group flex items-baseline gap-2.5" aria-label="Provenance, home">
          <span
            aria-hidden
            className="inline-block size-[9px] translate-y-[-1px] rotate-45 bg-signal transition-transform duration-500 group-hover:rotate-[225deg]"
          />
          <span className="font-mono text-[0.8rem] font-medium tracking-[0.3em] uppercase">Provenance</span>
          <sup className="hidden font-mono text-[0.55rem] tracking-widest text-ink-faint sm:inline">pv/1</sup>
        </Link>

        <MastheadNav />

        <div className="flex items-center gap-4">
          <Suspense fallback={<span className="label">···</span>}>
            <WhoAmI />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

export function Colophon() {
  return (
    <footer className="mt-24 border-t border-ink">
      <div className="shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="display-lg max-w-[18ch]">
            A record that admits its mistakes is worth more than one that doesn&apos;t.
          </p>
          <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-ink-soft">
            Provenance is an open format — its protocol id is <span className="font-mono text-xs">pv.intent/1</span>. The
            chain is SHA-256, the verifier is a single file, and the whole record exports as JSON.
          </p>
        </div>
        <div>
          <p className="label mb-3">Index</p>
          <ul className="space-y-1.5 text-sm">
            <li>
              <Link className="link-underline" href="/#proof">
                The proof
              </Link>
            </li>
            <li>
              <Link className="link-underline" href="/#mechanism">
                The mechanism
              </Link>
            </li>
            <li>
              <Link className="link-underline" href="/#start">
                Open a ledger
              </Link>
            </li>
            <li>
              <Link className="link-underline" href="/code">
                CLI &amp; API
              </Link>
            </li>
            <li>
              <Link className="link-underline" href="/verify">
                Verify a proof
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="label mb-3">Colophon</p>
          <dl className="space-y-1.5 text-sm text-ink-soft">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Type</dt>
              <dd className="font-mono text-xs">Fraunces / Instrument Serif / Geist Mono</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Format</dt>
              <dd className="font-mono text-xs">pv.intent/1</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Chain</dt>
              <dd className="font-mono text-xs">SHA-256</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Feed</dt>
              <dd>
                <a className="link-underline font-mono text-xs" href="/feed.xml">
                  RSS
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Schema</dt>
              <dd>
                <a className="link-underline font-mono text-xs" href="/api/openapi">
                  OpenAPI
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="shell flex flex-wrap items-center justify-between gap-2 border-t border-rule py-5">
        <p className="label">Provenance — Built to be checked.</p>
        <p className="label">Set in Fraunces &amp; Geist Mono · Printed on the web</p>
      </div>
    </footer>
  );
}
