"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const POLICIES = [
  { value: "half", label: "Headroom", hint: "A fixed four-point allowance. About four careful decisions fit; one low-confidence gamble just fits; two do not. The honest default." },
  { value: "zero", label: "Zero", hint: "Any open drift is a slip. For decisions where being wrong is expensive." },
  { value: "none", label: "Unpoliced", hint: "The ledger still records drift, but no slip can issue." },
];

export function NewCaseForm() {
  const router = useRouter();
  const [policy, setPolicy] = useState("half");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        kind: form.get("kind"),
        policy,
        windowDays: Number(form.get("windowDays") ?? 14),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not open the case.");
      return;
    }
    router.push(`/c/${json.ref}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="space-y-9">
        <label className="block">
          <span className="label">What are you deciding?</span>
          <input
            className="h-lg mt-2 w-full border-0 border-b border-rule-strong bg-transparent pb-3 placeholder:text-ink-faint focus:border-ink focus:outline-none"
            name="title"
            required
            minLength={3}
            maxLength={160}
            placeholder="Relaunch checkout without address validation"
          />
        </label>

        <div className="grid gap-9 sm:grid-cols-2">
          <label className="block">
            <span className="label">Kind</span>
            <select className="input" name="kind" defaultValue="decision">
              <option value="decision">Decision</option>
              <option value="incident">Incident</option>
              <option value="forecast">Forecast</option>
              <option value="hire">Hire</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Rolling window (days)</span>
            <input className="input" name="windowDays" type="number" min={1} max={90} defaultValue={14} />
          </label>
        </div>

        <fieldset>
          <legend className="label">Exposure policy</legend>
          <div className="mt-3 divide-y divide-rule border-y border-rule">
            {POLICIES.map((p) => (
              <label
                key={p.value}
                className={`flex cursor-pointer items-start gap-4 py-4 pl-1 transition-colors ${
                  policy === p.value ? "border-l-2 border-l-ink bg-paper-deep/30 pl-4" : "border-l-2 border-l-transparent hover:bg-paper-deep/20"
                }`}
              >
                <input
                  type="radio"
                  name="policy"
                  value={p.value}
                  checked={policy === p.value}
                  onChange={() => setPolicy(p.value)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`mt-1.5 size-3 shrink-0 rotate-45 border ${policy === p.value ? "border-ink bg-ink" : "border-rule-strong"}`}
                />
                <span>
                  <span className="block font-mono text-[0.7rem] uppercase tracking-[0.14em]">{p.label}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{p.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy ? "Opening…" : "Open the case"}
        </button>
      </div>

      <aside className="border-t border-ink pt-4 text-sm leading-relaxed text-ink-soft">
        <p className="label label-ink">Choosing a policy</p>
        <p className="mt-3">
          A <em className="italic">slip</em> is not a punishment. It is a disclosure: the record says the case asked
          for more trust than its decisions had earned, with the reason.
        </p>
        <p className="mt-3">
          Pick <strong className="font-medium text-ink">Zero</strong> for high-stakes work and{" "}
          <strong className="font-medium text-ink">Headroom</strong> elsewhere. A policy you never break tells a
          recruiter nothing.
        </p>
      </aside>
    </form>
  );
}
