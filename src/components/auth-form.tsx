"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One form, two entry points. In development it also doubles as sign-in so a
 * demo user can be reclaimed after a server restart.
 */
export function AuthForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = Object.fromEntries(data.entries());
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      router.refresh();
      router.push("/dashboard");
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "" : "border border-ink p-6 sm:p-8"}>
      <div className="mb-7 flex items-baseline gap-2 border-b border-rule pb-3">
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`font-mono text-[0.68rem] uppercase tracking-[0.16em] transition-colors ${
            mode === "register" ? "text-ink" : "text-ink-faint hover:text-ink-soft"
          }`}
          aria-pressed={mode === "register"}
        >
          Open a ledger
        </button>
        <span className="text-ink-faint">/</span>
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`font-mono text-[0.68rem] uppercase tracking-[0.16em] transition-colors ${
            mode === "login" ? "text-ink" : "text-ink-faint hover:text-ink-soft"
          }`}
          aria-pressed={mode === "login"}
        >
          Sign in
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {mode === "register" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Name</span>
              <input className="input" name="name" required autoComplete="name" placeholder="Ada Lovelace" />
            </label>
            <label className="block">
              <span className="label">Handle</span>
              <input className="input" name="handle" autoComplete="username" placeholder="ada" />
            </label>
          </div>
        )}
        <label className="block">
          <span className="label">Email</span>
          <input className="input" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input
            className="input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder={mode === "register" ? "at least 8 characters" : "••••••••"}
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn w-full" disabled={busy}>
          {busy ? "Working…" : mode === "register" ? "Open my ledger" : "Sign in"}
        </button>
        <p className="text-xs leading-relaxed text-ink-faint">
          Your ledger is private. When you seal a case it appears in the public feed with its head hash — never your raw
          notes.
        </p>
      </form>
    </div>
  );
}
