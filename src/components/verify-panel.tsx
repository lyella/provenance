"use client";

import { useState } from "react";
import { verifyChain, GENESIS, type IntentLink } from "@/lib/chain";
import type { Verified } from "@/lib/types";

/**
 * Offline verification, in the browser.
 *
 * Paste (or load) a proof bundle and every hash is recomputed with the Web
 * Crypto API on this machine. Nothing is sent anywhere — which is exactly the
 * claim the rest of the app makes, made checkable.
 */

interface BundleLink {
  n: number;
  prev: string;
  hash: string;
  body: string;
  confidence: string;
  evidence: string[];
  tags: string[];
  supersedes: string | null;
  by: string;
  source: string;
  createdAt: string;
}

interface Bundle {
  protocol: string;
  ref: string;
  head: string;
  links: BundleLink[];
}

type Outcome =
  | { kind: "ok"; result: Verified; headMatches: boolean; head: string }
  | { kind: "fail"; message: string; result?: Verified }
  | null;

export function VerifyPanel({ initialRef }: { initialRef?: string }) {
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<string | null>(null);

  async function loadFromServer(ref: string) {
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch(`/api/v1/cases/${ref}/export`, { cache: "no-store" });
      if (!res.ok) {
        setOutcome({ kind: "fail", message: `Could not load ${ref}: ${res.status}` });
        return;
      }
      const bundle = (await res.json()) as Bundle;
      setText(JSON.stringify(bundle, null, 2));
      setSource(`Loaded ${bundle.links.length} links from the server — now verifying locally`);
      await verify(bundle);
    } catch {
      setOutcome({ kind: "fail", message: "Network error while loading the proof." });
    } finally {
      setBusy(false);
    }
  }

  async function verify(bundle?: Bundle) {
    setOutcome(null);
    let parsed: Bundle;
    try {
      parsed = bundle ?? (JSON.parse(text) as Bundle);
    } catch {
      setOutcome({ kind: "fail", message: "That is not valid JSON." });
      return;
    }
    if (!parsed?.links || !parsed.head) {
      setOutcome({
        kind: "fail",
        message: "This does not look like a provenance proof bundle (links + head are required).",
      });
      return;
    }

    const links = parsed.links.map((l) => ({
      caseRef: parsed.ref,
      n: l.n,
      body: l.body,
      confidence: l.confidence as IntentLink["confidence"],
      evidence: l.evidence,
      tags: l.tags,
      supersedes: l.supersedes,
      by: l.by,
      source: l.source,
      createdAt: l.createdAt,
      prev: l.prev,
      // `intentHash` folds in only the committed fields, so carrying the stored
      // hash alongside is inert; it keeps the shape identical to the server's.
      hash: l.hash,
    }));

    const result = await verifyChain(links, crypto.subtle);
    const headMatches = result.computedHead === parsed.head;
    setSource(null);
    if (result.valid && headMatches) {
      setOutcome({ kind: "ok", result, headMatches, head: parsed.head });
    } else {
      setOutcome({
        kind: "fail",
        result,
        message: !result.valid ? result.reason : "the recomputed head does not match the published head",
      });
    }
  }

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
          <span className="label label-ink">Proof bundle (json)</span>
          <div className="flex flex-wrap gap-2">
            {initialRef && (
              <button className="btn btn-ghost btn-sm" onClick={() => void loadFromServer(initialRef)} disabled={busy}>
                {busy ? "Loading…" : `Load ${initialRef}`}
              </button>
            )}
            <button className="btn btn-sm" onClick={() => void verify()} disabled={busy || !text.trim()}>
              Verify locally
            </button>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOutcome(null);
          }}
          rows={16}
          spellCheck={false}
          placeholder="Paste a proof.json from “Download proof”, or paste any export you were given."
          className="mt-3 w-full resize-y border border-ink bg-night p-4 font-mono text-[0.72rem] leading-relaxed text-paper outline-none placeholder:text-paper/40"
        />
        {source && <p className="mt-2 text-[0.7rem] text-ink-faint">{source}</p>}

        {outcome?.kind === "ok" && (
          <div className="mt-6 border-y border-verified py-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="stamp stamp-verified stamp-in">Verified</span>
              <span className="numeral text-3xl text-ink">{outcome.result.checked}</span>
              <span className="label">links · head {outcome.head.slice(0, 16)}…</span>
            </div>
            <p className="mt-3 max-w-[52ch] text-xs leading-relaxed text-ink-soft">
              Every link hashes to its recorded value, every pointer matches, and the recomputed head equals the
              published one. This computation ran in your browser.
            </p>
          </div>
        )}

        {outcome?.kind === "fail" && (
          <div className="mt-6 border-y border-alarm py-5">
            <span className="stamp stamp-broken stamp-in">
              {outcome.result?.brokenAt ? `Broken at #${outcome.result.brokenAt}` : "Invalid"}
            </span>
            <p className="display-md mt-3 text-alarm">{outcome.message}</p>
            {outcome.result && !outcome.result.valid && outcome.result.checked > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                {outcome.result.checked} link(s) before the break are intact — the damage is at or after link #
                {outcome.result.brokenAt}.
              </p>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-6 text-xs leading-relaxed text-ink-soft">
        <div className="border-t border-ink pt-3">
          <p className="label label-ink">How this works</p>
          <ol className="mt-3 space-y-2">
            <li className="flex gap-3">
              <span className="numeral text-ink-faint">01</span>Each link names its predecessor&rsquo;s hash.
            </li>
            <li className="flex gap-3">
              <span className="numeral text-ink-faint">02</span>Its own hash covers its content plus that pointer.
            </li>
            <li className="flex gap-3">
              <span className="numeral text-ink-faint">03</span>The last hash is the head — the whole record, compressed.
            </li>
          </ol>
        </div>
        <div className="border-t border-rule pt-3">
          <p className="label label-ink">Try to break it</p>
          <p className="mt-2">
            Change one word in any <code className="font-mono text-ink">body</code> and verify again. The link that held
            that text fails, and so does every link after it — the record cannot be edited in place.
          </p>
        </div>
        <p className="border-t border-rule pt-3 text-ink-faint">
          First pointer must be 64 zeros (genesis): <span className="font-mono">{GENESIS.slice(0, 8)}…</span>
        </p>
      </aside>
    </div>
  );
}
