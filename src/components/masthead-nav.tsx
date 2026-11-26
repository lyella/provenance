"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/#proof", label: "Proof", index: "01" },
  { href: "/#mechanism", label: "Mechanism", index: "02" },
  { href: "/verify", label: "Verify", index: "03" },
  { href: "/code", label: "Code", index: "04" },
];

/** A minimal desktop index; on phones it collapses to a single link. */
export function MastheadNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex items-baseline gap-1.5 font-mono text-[0.68rem] tracking-[0.16em] uppercase text-ink-soft transition-colors hover:text-ink"
          >
            <span className="text-[0.55rem] text-ink-faint">{l.index}</span>
            <span className="link-underline">{l.label}</span>
          </Link>
        ))}
      </nav>
      <Link
        href="/dashboard"
        className="font-mono text-[0.68rem] tracking-[0.16em] uppercase text-ink-soft md:hidden"
      >
        {scrolled ? "Ledger ↗" : "Ledger"}
      </Link>
    </>
  );
}
