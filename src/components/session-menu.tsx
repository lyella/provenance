"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SessionMenu({ user }: { user: { name: string; handle: string } | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <Link href="/#start" className="btn btn-ghost btn-sm">
        Sign in
      </Link>
    );
  }

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setBusy(false);
    startTransition(() => router.refresh());
    router.push("/");
  }

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <Link href="/dashboard" className="group flex items-center gap-2 text-ink-soft hover:text-ink">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full border border-ink font-mono text-[0.62rem] tracking-wider transition-colors group-hover:bg-ink group-hover:text-paper"
        >
          {initials}
        </span>
        <span className="hidden font-mono text-[0.7rem] tracking-[0.12em] sm:inline">@{user.handle}</span>
      </Link>
      <button
        className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink"
        onClick={signOut}
        disabled={busy || pending}
      >
        {busy || pending ? "···" : "Sign out"}
      </button>
    </div>
  );
}
