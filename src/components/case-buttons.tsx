"use client";

import { useState } from "react";

export function FlagButton({ caseRef, n, onCommitted }: { caseRef: string; n: number; onCommitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${caseRef}/flag/${n}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not record the flag.");
        return;
      }
      setOpen(false);
      setReason("");
      onCommitted();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="label text-alarm hover:underline" onClick={() => setOpen(true)}>
        flag as wrong (+1.5×)
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="border border-alarm/40 bg-alarm-soft/40 p-2">
      <label className="label !text-alarm" htmlFor={`flag-${n}`}>
        What went wrong with #{n}?
      </label>
      <input
        id={`flag-${n}`}
        className="input mt-1 !text-sm"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Gateway rejects intents without a confirmed address"
        required
        minLength={3}
      />
      {error && <p className="field-error mt-1">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button className="btn !border-alarm !bg-alarm !py-1" disabled={busy}>
          {busy ? "…" : "Flag it"}
        </button>
        <button type="button" className="btn btn-ghost !py-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SealButton({ caseRef, onSealed }: { caseRef: string; onSealed: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${caseRef}/seal`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not seal.");
        return;
      }
      onSealed();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!confirming ? (
        <button className="btn btn-ghost w-full" onClick={() => setConfirming(true)}>
          Seal the case
        </button>
      ) : (
        <div className="border border-ink p-3">
          <p className="text-xs leading-relaxed text-ink-soft">
            Sealing is permanent. The chain freezes and its head is published to the feed.
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn !py-1" onClick={seal} disabled={busy}>
              {busy ? "Sealing…" : "Yes, seal"}
            </button>
            <button className="btn btn-ghost !py-1" onClick={() => setConfirming(false)} disabled={busy}>
              Not yet
            </button>
          </div>
        </div>
      )}
      {error && <p className="field-error mt-1">{error}</p>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="label hover:text-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
