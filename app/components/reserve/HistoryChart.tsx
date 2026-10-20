"use client";

/**
 * The reserve balance over time, as a step line: the balance only moves when a
 * dated ledger movement lands. Rebuilt by `lib/history` from the same ledger
 * rows the activity list shows, walked back from the current read.
 * Precision Brutalism: no grid, a neutral 2px line, square markers, only the
 * final value labelled, no animation.
 * Hover or arrow keys move a crosshair; a hidden table is the text alternative.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Mono } from "@/components/Mono";
import { UsdHint } from "@/components/MoneyProvider";
import { PERIODS, PeriodPicker, inPeriod, type Period } from "@/components/reserve/sections/Flows";
import { signed } from "@/components/reserve/sections/shared";
import { coveringPeriod, historyWindow, pointAt, stableAssetsHistory, yTicks } from "@/lib/history";
import { fmtBrs, fmtTime } from "@/lib/format";
import { FLOW_KIND_LABEL, type FlowRow } from "@/lib/view";

const W = 1000;
const H = 180;
const LINE = "var(--color-chart-1)";
const NUM = { fontVariantNumeric: "tabular-nums" } as const;

const day = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function HistoryChart({ rows, stableAssets, now }: { rows: FlowRow[]; stableAssets: bigint; now: bigint }) {
  // Until the reader picks a window, open on the smallest one that holds all the data.
  const [picked, setPeriod] = useState<Period | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);

  const history = useMemo(() => stableAssetsHistory(rows, stableAssets, now), [rows, stableAssets, now]);
  const period = picked ?? coveringPeriod<Period>(history, PERIODS, "90D");
  const w = useMemo(() => historyWindow(history, PERIODS[period]), [history, period]);
  const moves = rows.filter((r) => r.at !== null && inPeriod(r.at, now, period)).length;

  // Round BRS steps.
  const ticks = yTicks(w.min, w.max);
  const lo = Number(ticks[0]!);
  const hi = Number(ticks.at(-1)!);
  const span = Number(w.end - w.start) || 1;
  const fx = (t: bigint) => (Number(t - w.start) / span) * W;
  const fy = (v: bigint) => (hi === lo ? H / 2 : H - ((Number(v) - lo) / (hi - lo)) * H);
  const pctX = (t: bigint) => `${(fx(t) / W) * 100}%`;
  const pctY = (v: bigint) => `${(fy(v) / H) * 100}%`;

  const pts = w.points;
  let line = `M ${fx(pts[0]!.at).toFixed(1)} ${fy(pts[0]!.value).toFixed(1)}`;
  for (const p of pts.slice(1)) line += ` H ${fx(p.at).toFixed(1)} V ${fy(p.value).toFixed(1)}`;
  line += ` H ${W}`;
  const area = `${line} V ${H} H ${fx(pts[0]!.at).toFixed(1)} Z`;

  const first = pts[0]!.value;
  const change = stableAssets - first;
  const changeText = change === 0n ? "no change" : `${change > 0n ? "+" : "−"}${fmtBrs(change < 0n ? -change : change)}`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const f = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    setActive(pointAt(w, w.start + BigInt(Math.round(f * span))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const last = pts.length - 1;
      setActive((i) => (i === null ? last : Math.min(Math.max(i + (e.key === "ArrowRight" ? 1 : -1), 0), last)));
    } else if (e.key === "Escape") setActive(null);
  };

  const a = active !== null ? pts[Math.min(active, pts.length - 1)] : undefined;
  const right = a ? fx(a.at) > W * 0.55 : false;

  return (
    <figure aria-labelledby="history-h" className="bg-(--color-surface) m-0 flex min-w-0 flex-col gap-4 border p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p id="history-h" className="font-body text-(--color-text-2) m-0 text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
            Reserve balance over time
          </p>
          <Mono style={{ ...NUM, fontSize: 12, color: "var(--color-text-2)" }}>
            {changeText} · {moves} {moves === 1 ? "movement" : "movements"}
          </Mono>
        </div>
        <PeriodPicker value={period} onChange={(p) => {
            setPeriod(p);
            setActive(null);
          }} label="History period" />
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* y-axis labels, mono text-3, aligned to the ticks (no gridlines) */}
        <div className="relative" style={{ height: H }} aria-hidden="true">
          {ticks.map((t) => (
            <Mono key={t.toString()} style={{ ...NUM, position: "absolute", right: 0, top: pctY(t), transform: "translateY(-50%)", fontSize: 10, color: "var(--color-text-3)", whiteSpace: "nowrap" }}>
              {fmtBrs(t, 0)}
            </Mono>
          ))}
          {/* reserves the column width for the widest label */}
          <Mono style={{ ...NUM, visibility: "hidden", fontSize: 10, whiteSpace: "nowrap" }}>{fmtBrs(ticks.at(-1)!, 0)}</Mono>
        </div>

        <div
          ref={plot}
          role="img"
          tabIndex={0}
          aria-label={`Reserve balance from ${day(w.start)} to today: ${fmtBrs(first)} to ${fmtBrs(stableAssets)}. Arrow keys step through the movements.`}
          className="relative cursor-crosshair touch-none outline-offset-4"
          style={{ height: H }}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 block size-full overflow-visible" aria-hidden="true">
            <path d={area} fill={LINE} fillOpacity={0.06} stroke="none" />
            <path d={line} fill="none" stroke={LINE} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="miter" />
          </svg>
          {/* the current balance, always marked */}
          <span aria-hidden="true" className="absolute size-2" style={{ left: "100%", top: pctY(stableAssets), transform: "translate(-50%, -50%)", background: LINE, outline: "2px solid var(--color-surface)" }} />
          {/* The only value label on the plot: today's balance, in bold, above the end marker. */}
          {!a && (
            <span
              aria-hidden="true"
              className="font-mono pointer-events-none absolute right-0"
              style={{ ...NUM, top: pctY(stableAssets), transform: fy(stableAssets) < 28 ? "translateY(10px)" : "translateY(calc(-100% - 10px))", fontSize: 12, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}
            >
              {fmtBrs(stableAssets)}
            </span>
          )}
          {a && (
            <>
              <div aria-hidden="true" className="absolute inset-y-0" style={{ left: pctX(a.at), borderLeft: "1px solid var(--color-text-3)" }} />
              <span aria-hidden="true" className="absolute size-2" style={{ left: pctX(a.at), top: pctY(a.value), transform: "translate(-50%, -50%)", background: "var(--color-text)", outline: "2px solid var(--color-surface)" }} />
              <div
                aria-hidden="true"
                className="bg-(--color-surface-2) pointer-events-none absolute top-0 z-10 flex flex-col gap-1 border px-3 py-2"
                style={{ left: pctX(a.at), transform: right ? "translateX(calc(-100% - 8px))" : "translateX(8px)", minWidth: 150 }}
              >
                <Mono style={{ ...NUM, fontSize: 10, color: "var(--color-text-3)", whiteSpace: "nowrap" }}>{a.step ? fmtTime(a.at) : `${day(a.at)} · period start`}</Mono>
                <Mono style={{ ...NUM, fontSize: 13, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}>
                  {fmtBrs(a.value)}
                  <UsdHint brs={a.value} block />
                </Mono>
                {a.step && (
                  <span className="font-body text-(--color-text-2) text-[11px] whitespace-nowrap">
                    {FLOW_KIND_LABEL[a.step.kind]} {signed(a.step.delta, fmtBrs)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <span />
        <div className="flex justify-between pt-2" aria-hidden="true">
          <Mono style={{ ...NUM, fontSize: 10, color: "var(--color-text-3)" }}>{day(w.start)}</Mono>
          <Mono style={{ ...NUM, fontSize: 10, color: "var(--color-text-3)" }}>Today</Mono>
        </div>
      </div>

      <figcaption className="font-body text-(--color-text-3) text-2xs leading-relaxed">
        Reconstructed from recent activity (last 100 transactions per account): today&apos;s reserve balance, walked back through the dated guarantee fees, issuer income, claim payments and queue fills.
      </figcaption>

      {/* sr-only on a <div>: a table sizes to its content and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>Reserve balance after each movement</caption>
          <thead>
            <tr>
              <th scope="col">Date (UTC)</th>
              <th scope="col">Movement</th>
              <th scope="col">Reserve balance</th>
            </tr>
          </thead>
          <tbody>
            {pts.map((p, i) => (
              <tr key={i}>
                <td>{fmtTime(p.at)}</td>
                <td>{p.step ? `${FLOW_KIND_LABEL[p.step.kind]} ${signed(p.step.delta, fmtBrs)}` : "Period start"}</td>
                <td>{fmtBrs(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
