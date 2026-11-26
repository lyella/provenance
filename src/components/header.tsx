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
 * Masthead: wordmark hard left, index hard right, a single heavy rule beneath —
 * the reference's one structural device. Sticky so the index stays reachable.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-paper">
      <div className="shell flex h-20 items-center justify-between gap-6 sm:h-24">
        <Link href="/" className="flex items-baseline gap-2" aria-label="Provenance, home">
          <span className="text-[1.4rem] font-black tracking-tight uppercase sm:text-[1.6rem]">Provenance</span>
          <span className="mono hidden text-[0.7rem] text-ink-faint sm:inline">pv/1</span>
        </Link>

        <div className="flex items-center gap-6 sm:gap-8">
          <MastheadNav />
          <Suspense fallback={<span className="mono text-sm text-ink-faint">···</span>}>
            <WhoAmI />
          </Suspense>
        </div>
      </div>
      <div className="masthead-rule" />
    </header>
  );
}

const FOOTER_LINKS = [
  { href: "/#proof", label: "Proof" },
  { href: "/#mechanism", label: "Mechanism" },
  { href: "/#start", label: "Ledger" },
  { href: "/verify", label: "Verify" },
  { href: "/code", label: "Code" },
];

export function Colophon() {
  return (
    <footer className="mt-0 bg-paper">
      <div className="masthead-rule" />
      <div className="shell grid gap-12 py-16 md:grid-cols-[1.3fr_1fr_1fr] md:py-20">
        <div>
          <p className="label mb-4">Which provenance is this?</p>
          <p className="h-lg max-w-[20ch]">A record that admits its mistakes is worth more than one that doesn&apos;t.</p>
        </div>
        <div>
          <p className="label mb-4">Provenance</p>
          <ul className="space-y-1.5">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link className="link text-[1.0625rem]" href={l.href}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label mb-4">Technical</p>
          <dl className="space-y-2 text-[1.0625rem]">
            <div className="flex justify-between gap-4 border-b border-rule pb-2">
              <dt className="text-ink-soft">Format</dt>
              <dd className="mono text-sm">pv.intent/1</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-rule pb-2">
              <dt className="text-ink-soft">Chain</dt>
              <dd className="mono text-sm">SHA-256</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-rule pb-2">
              <dt className="text-ink-soft">Feed</dt>
              <dd>
                <a className="mono link text-sm" href="/feed.xml">
                  RSS
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-rule pb-2">
              <dt className="text-ink-soft">Schema</dt>
              <dd>
                <a className="mono link text-sm" href="/api/openapi">
                  OpenAPI
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Set in</dt>
              <dd className="mono text-sm">Fira Sans / JetBrains Mono</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="band">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-5">
          <p className="mono text-sm text-white/90">Provenance — built to be checked.</p>
          <p className="mono text-sm text-white/90">No accounts required to verify.</p>
        </div>
      </div>
    </footer>
  );
}
