import type { Intent, Slip, SlipResult, Verified } from "@/lib/types";

/* ------------------------------- stamps ------------------------------- */

export function Stamp({
  kind,
  children,
  animate = false,
}: {
  kind: "slipped" | "verified" | "broken" | "neutral" | "sealed";
  children: React.ReactNode;
  animate?: boolean;
}) {
  const cls =
    kind === "slipped"
      ? "stamp-slipped"
      : kind === "verified"
        ? "stamp-verified"
        : kind === "broken"
          ? "stamp-broken"
          : "text-ink-soft";
  return <span className={`stamp ${cls} ${animate ? "stamp-in" : ""}`}>{children}</span>;
}

export function VerifyStamp({
  verified,
  animate = false,
}: {
  verified: Pick<Verified, "valid" | "checked" | "brokenAt">;
  animate?: boolean;
}) {
  if (verified.valid) {
    return (
      <Stamp kind="verified" animate={animate}>
        verified{verified.checked > 0 ? ` · ${verified.checked} link${verified.checked === 1 ? "" : "s"}` : ""}
      </Stamp>
    );
  }
  return (
    <Stamp kind="broken" animate={animate}>
      chain broken{verified.brokenAt ? ` at #${verified.brokenAt}` : ""}
    </Stamp>
  );
}

/* ------------------------------- ledger ------------------------------- */

const CONF_META: Record<Intent["confidence"], { label: string; px: number; width: number }> = {
  low: { label: "low", px: 4, width: 18 },
  medium: { label: "medium", px: 2, width: 9 },
  high: { label: "high", px: 1, width: 5 },
};

const STATUS_NOTE: Record<Intent["status"], string> = {
  active: "",
  superseded: "amended later",
  withdrawn: "withdrawn",
  flagged: "flagged as wrong",
};

/**
 * The exposure strip: running drift drawn as a plain line. The cap is a dashed
 * signal rule; every point above it is filled in signal colour.
 */
export function ExposureStrip({
  points,
  cap,
}: {
  points: Array<{ n: number; drift: number }>;
  cap: number;
}) {
  const w = 900;
  const h = 150;
  const pad = 10;
  if (points.length === 0) {
    return <div className="h-[150px] border-b border-rule" aria-hidden />;
  }
  const maxDrift = Math.max(cap > 0 && cap !== Infinity ? cap : 0, ...points.map((p) => p.drift), 1);
  const minDrift = Math.min(0, ...points.map((p) => p.drift));
  const span = maxDrift - minDrift || 1;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - minDrift) / span) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.drift).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(minDrift).toFixed(1)} L${x(0).toFixed(1)},${y(minDrift).toFixed(1)} Z`;
  const capY = cap > 0 && cap !== Infinity ? y(cap) : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-[110px] w-full sm:h-[150px]"
      role="img"
      aria-label={`Running exposure across ${points.length} decisions, cap ${cap}`}
      preserveAspectRatio="none"
    >
      <path d={area} fill="var(--rule)" opacity="0.4" />
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" strokeWidth="1" />
      {capY !== null && (
        <line
          x1={pad}
          x2={w - pad}
          y1={capY}
          y2={capY}
          stroke="var(--signal)"
          strokeWidth="1"
          strokeDasharray="5 5"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={line} fill="none" stroke="var(--ink)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle
          key={`${p.n}-${i}`}
          cx={x(i)}
          cy={y(p.drift)}
          r={3}
          fill={cap > 0 && cap !== Infinity && p.drift > cap ? "var(--signal)" : "var(--ink)"}
        />
      ))}
    </svg>
  );
}

export function LedgerTable({ intents }: { intents: Intent[] }) {
  return (
    <ol className="divide-y divide-rule">
      {intents.map((intent) => {
        const conf = CONF_META[intent.confidence];
        return (
          <li
            key={intent.id}
            className="row-in grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-l-2 border-transparent py-4 pl-4 transition-colors hover:border-ink hover:bg-paper-deep/30 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6"
            style={intent.status === "flagged" ? { borderLeftColor: "var(--signal)" } : undefined}
          >
            <div className="numeral pt-1 text-right text-lg text-ink-faint">{String(intent.n).padStart(2, "0")}</div>
            <div className="min-w-0">
              <p
                className={`display-md !text-[1.2rem] leading-snug sm:!text-[1.35rem] ${
                  intent.status === "flagged"
                    ? "text-alarm line-through decoration-alarm/30 decoration-1"
                    : intent.status === "superseded" || intent.status === "withdrawn"
                      ? "text-ink-faint"
                      : "text-ink"
                }`}
              >
                {intent.unreadable ? <em className="text-ink-faint">[intent body unreadable — hash intact]</em> : intent.body}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[0.66rem] text-ink-faint">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-[7px] bg-ink" style={{ width: conf.width }} />
                  <span>{conf.label}</span>
                  <span>· {conf.px}px</span>
                </span>
                <span aria-hidden>·</span>
                <span>◧ {intent.byDouble}</span>
                <span aria-hidden>·</span>
                <span>{intent.source}</span>
                <span aria-hidden>·</span>
                <time dateTime={intent.createdAt}>
                  {new Date(intent.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </time>
                {intent.status !== "active" && (
                  <span className={intent.status === "flagged" ? "font-medium text-alarm" : ""}>
                    {STATUS_NOTE[intent.status]}
                  </span>
                )}
                <span aria-hidden>·</span>
                <span className="text-ink-soft" title={intent.hash}>
                  {intent.hash.slice(0, 12)}
                </span>
              </div>
              {intent.evidence.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {intent.evidence.map((e) => (
                    <li key={e} className="border border-rule bg-paper px-2 py-0.5 font-mono text-[0.62rem] text-ink-soft">
                      {e}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------- slip -------------------------------- */

export function SlipCard({
  slip,
  slipDetail,
  animate = false,
}: {
  slip: Slip;
  slipDetail?: SlipResult | null;
  animate?: boolean;
}) {
  return (
    <div className="relative border border-signal bg-signal-soft/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-signal/40 px-5 py-3">
        <span className={`stamp stamp-slipped ${animate ? "stamp-in" : ""}`}>Share slip</span>
        <span className="font-mono text-sm tracking-[0.18em] text-signal">{slip.authorization}</span>
      </div>
      <dl className="grid grid-cols-2 divide-rule sm:grid-cols-4 sm:divide-x">
        {[
          ["Cap", `${slip.exposure_cap} px`, false],
          ["Open drift", `${slip.open_drift} px`, true],
          ["Window", `${slip.window_days}d`, false],
          ["Policy", slip.policy === "half" ? "headroom" : slip.policy, false],
        ].map(([k, v, hot]) => (
          <div key={String(k)} className="px-4 py-3">
            <dt className="label">{k}</dt>
            <dd className={`numeral mt-1.5 text-xl whitespace-nowrap ${hot ? "text-signal" : "text-ink"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {slipDetail?.breaches?.length ? (
        <p className="border-t border-signal/40 px-5 py-3 text-xs leading-relaxed text-ink-soft">
          First crossed at <strong className="font-medium text-ink">#{slipDetail.breaches[0].n}</strong> on{" "}
          {new Date(slipDetail.breaches[0].on).toLocaleDateString("en-GB", { dateStyle: "medium" })}, when exposure
          reached <span className="font-mono">{slipDetail.breaches[0].crossed} px</span>. Worst measured{" "}
          <span className="font-mono">{slipDetail.worst?.ratio ?? 0}×</span> the cap.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------ helpers ------------------------------ */

export function short(hash: string, n = 10) {
  return hash.slice(0, n);
}

export function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
