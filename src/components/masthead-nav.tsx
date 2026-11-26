"use client";

import Link from "next/link";

const LINKS = [
  { href: "/#proof", label: "Proof" },
  { href: "/#mechanism", label: "Mechanism" },
  { href: "/verify", label: "Verify" },
  { href: "/code", label: "Code" },
];

/** Index links, set in the sans at the reference's weight and spacing. */
export function MastheadNav() {
  return (
    <>
      <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="link text-[1.0625rem] font-semibold">
            {l.label}
          </Link>
        ))}
      </nav>
      <Link href="/dashboard" className="link text-[1.0625rem] font-semibold md:hidden">
        Ledger
      </Link>
    </>
  );
}
