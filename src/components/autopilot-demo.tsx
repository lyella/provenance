"use client";

import { useCallback, useEffect, useState } from "react";
import type { CaseView } from "@/lib/types";

/**
 * The 12-second proof.
 *
 * An agent opens a case and takes real decisions. Pressing "next decision"
 * appends an actual signed intent to a real chain on the server — nothing here
 * is a mock. When the agent flags one of its own earlier decisions, the exposure
 * ledger crosses its cap and a Share Slip is stamped.
 */

interface RunState {
  started: boolean;
  done: boolean;
  step: number;
  total: number;
  case?: CaseView;
  say?: string;
  move?: string;
}

const CONF_LABEL = { low: "LOW", medium: "MED", high: "HIGH" } as const;

export function AutopilotDemo() {
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/v1/autopilot", { cache: "no-store" }).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      setRun(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(async (restart = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/autopilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restart }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not advance the run.");
        return;
      }
      setRun(body);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!auto || busy || !run || run.done) return;
    const t = setTimeout(() => void advance(), 520);
    return () => clearTimeout(t);
  }, [auto, busy, run, advance]);

  const started = Boolean(run?.started);
  const caseView = run?.case;
  const intents = caseView?.intents ?? [];
  const slipped = Boolean(caseView?.slipped);

  return (
    <div className="border border-ink bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-strong bg-paper-deep/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="label !text-ink">Autopilot agent</span>
          <span className="stamp !rotate-0 border-rule-strong !text-ink-faint">simulated · deterministic</span>
        </div>
        <div className="flex items-center gap-2">
          {!started && (
            <button className="btn" onClick={() => void advance()} disabled={busy}>
              {busy ? "Starting…" : "Start the run"}
            </button>
          )}
          {started && !run?.done && (
            <>
              <button className="btn btn-ghost" onClick={() => void advance()} disabled={busy}>
                {busy ? "…" : "Next decision"}
              </button>
              <button
                className="btn"
                onClick={() => setAuto((a) => !a)}
                aria-pressed={auto}
              >
                {auto ? "Pause" : "Run all"}
              </button>
            </>
          )}
          {started && run?.done && (
            <button className="btn btn-ghost" onClick={() => void advance(true)} disabled={busy}>
              {busy ? "…" : "Run again"}
            </button>
          )}
        </div>
      </div>

      {started && caseView && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule px-4 py-2 text-xs text-ink-soft">
          <span className="font-mono">{caseView.ref}</span>
          <span>
            policy <strong className="font-medium text-ink">headroom</strong>
          </span>
          <span className="font-mono">
            {run?.step ?? 0}/{run?.total ?? 12} decided
          </span>
          <span className={caseView.verified.valid ? "text-verified" : "font-medium text-alarm"}>
            chain {caseView.verified.valid ? "verifies" : "BROKEN"}
          </span>
        </div>
      )}

      {error && <p className="field-error px-4 py-2">{error}</p>}

      <div className="min-h-[18rem]">
        {!started ? (
          <div className="grid h-[18rem] place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-ink-soft">
                Twelve real decisions. Each one is hashed into a chain you can verify yourself.
              </p>
              <p className="mt-2 max-w-sm text-xs text-ink-faint">
                Watch what happens when the agent flags one of its own early assumptions. That is the whole idea.
              </p>
            </div>
          </div>
        ) : (
          <ol className="divide-y divide-rule">
            {[...intents].reverse().map((intent, index) => (
              <li
                key={intent.id}
                className={`row-in flex gap-3 px-4 py-2.5 ${index === 0 ? "bg-paper-deep/40" : ""}`}
              >
                <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-ink-faint">{intent.n}</span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-snug ${
                      intent.status === "flagged" ? "text-alarm line-through decoration-alarm/40" : "text-ink"
                    }`}
                  >
                    {intent.body}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.6875rem] text-ink-faint">
                    <span className="font-mono">{CONF_LABEL[intent.confidence]}</span>
                    <span aria-hidden>·</span>
                    <span className="font-mono">{intent.byDouble}</span>
                    <span aria-hidden>·</span>
                    <span className="hash">{intent.hash.slice(0, 10)}</span>
                    {intent.status === "flagged" && <span className="stamp stamp-slipped !rotate-0">flagged</span>}
                    {intent.tags.includes("flag") && <span className="stamp stamp-broken !rotate-0">self-flag</span>}
                  </div>
                </div>
              </li>
            ))}
            {intents.length === 0 && <li className="px-4 py-6 text-sm text-ink-faint">Opening the case…</li>}
          </ol>
        )}
      </div>

      {run?.say && !run.done && intents.length > 0 && (
        <p className="border-t border-rule bg-paper-deep/30 px-4 py-2 text-xs italic text-ink-soft">
          Agent: “{run.say}”
        </p>
      )}

      {slipped && caseView?.slip && (
        <div className="border-t border-ink bg-signal-soft/60 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="stamp stamp-slipped stamp-in text-[0.75rem]">Slipped</span>
            <span className="font-mono text-sm font-medium tracking-wider text-signal">
              {caseView.slip.authorization}
            </span>
            <span className="text-xs text-ink-soft">
              exposure crossed {caseView.slip.exposure_cap} points on an early promise the agent later called wrong.
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            In a normal tracker, that first decision still looks like a decision. Here it carries a price, and the record
            says so.
          </p>
        </div>
      )}

      {run?.done && caseView && !slipped && (
        <div className="border-t border-ink bg-verified-soft/60 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="stamp stamp-verified stamp-in text-[0.75rem]">Held</span>
            <span className="text-sm text-ink-soft">
              The run never asked to pass more exposure than it earned.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
