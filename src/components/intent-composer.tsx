"use client";

import { useId, useState } from "react";
import type { Confidence } from "@/lib/types";

const OPTIONS: Array<{ value: Confidence; label: string; px: number; hint: string }> = [
  { value: "low", label: "Low", px: 4, hint: "I am guessing. Costs 4." },
  { value: "medium", label: "Medium", px: 2, hint: "Reasonable, not certain. Costs 2." },
  { value: "high", label: "High", px: 1, hint: "I would defend this. Costs 1." },
];

export function IntentComposer({
  caseRef,
  nextN,
  amending,
  onAmendChange,
  onCommitted,
  open,
}: {
  caseRef: string;
  nextN: number;
  amending: { n: number; body: string } | null;
  onAmendChange: (target: { n: number; body: string } | null) => void;
  onCommitted: (optimistic: { body: string; confidence: Confidence; amendingN: number | null }) => void;
  open: boolean;
}) {
  const formId = useId();
  const [confidence, setConfidence] = useState<Confidence>("medium");
  const [evidence, setEvidence] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <section aria-labelledby={`${formId}-title`}>
        <h2 id={`${formId}-title`} className="label mb-2">
          Sealed
        </h2>
        <p className="border border-rule bg-paper-deep/40 p-4 text-sm text-ink-soft">
          This case is frozen. Its head is published and cannot change. Open a new case to keep deciding.
        </p>
      </section>
    );
  }

  const text = body || amending?.body || "";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    onCommitted({ body: trimmed, confidence, amendingN: amending?.n ?? null });
    try {
      const res = await fetch(`/api/v1/cases/${caseRef}/intents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          confidence,
          evidence: evidence
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          tags: [],
          ...(amending ? { supersedes: amending.n } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not record the intent.");
        return;
      }
      setBody("");
      setEvidence("");
      onAmendChange(null);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${formId}-title`} className="border border-ink bg-paper p-5">
      <form onSubmit={submit}>
        <div className="flex items-baseline justify-between border-b border-rule pb-2">
          <h2 id={`${formId}-title`} className="label label-ink">
            {amending ? `Amend #${amending.n}` : `Decision ${String(nextN).padStart(2, "0")}`}
          </h2>
          {amending && (
            <button
              type="button"
              className="font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
              onClick={() => {
                onAmendChange(null);
                setBody("");
              }}
            >
              cancel
            </button>
          )}
        </div>

        <label className="mt-4 block">
          <span className="sr-only">Your decision</span>
          <textarea
            rows={3}
            required
            value={text}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What are you committing to, right now?"
            className="h-md w-full resize-none border-0 border-b border-rule-strong bg-transparent pb-2 !text-[1.15rem] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="label">How sure are you?</legend>
          <div className="mt-2 grid grid-cols-3 gap-px bg-rule">
            {OPTIONS.map((o) => (
              <label
                key={o.value}
                className={`cursor-pointer bg-paper px-2 py-2.5 text-center transition-colors ${
                  confidence === o.value ? "bg-ink text-paper" : "hover:bg-paper-deep"
                }`}
              >
                <input
                  type="radio"
                  name="confidence"
                  value={o.value}
                  checked={confidence === o.value}
                  onChange={() => setConfidence(o.value)}
                  className="sr-only"
                />
                <span className="block font-mono text-[0.68rem] uppercase tracking-[0.14em]">{o.label}</span>
                <span className="numeral mt-0.5 block text-lg opacity-80">{o.px}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[0.7rem] leading-snug text-ink-faint">{OPTIONS.find((o) => o.value === confidence)?.hint}</p>
        </fieldset>

        <label className="mt-4 block">
          <span className="label">Evidence (comma separated)</span>
          <input
            className="input"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="load test 1.2k rps, incident 4821"
          />
        </label>

        {error && (
          <p className="field-error mt-3" role="alert">
            {error}
          </p>
        )}
        <button className="btn mt-5 w-full" disabled={busy}>
          {busy ? "Signing…" : amending ? "Amend and sign" : "Record decision"}
        </button>
      </form>
    </section>
  );
}
