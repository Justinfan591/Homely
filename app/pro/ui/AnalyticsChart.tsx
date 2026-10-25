"use client";
import { useState } from "react";

type Week = { label: string; revenue: number; bookings: number };

const cad = (n: number) => `CA$${Math.round(n).toLocaleString("en-CA")}`;

/** Per-week bars with a Revenue / Bookings toggle and a readout of the hovered (or latest) week. */
export function AnalyticsChart({ weeks }: { weeks: Week[] }) {
  const [metric, setMetric] = useState<"revenue" | "bookings">("revenue");
  const [hover, setHover] = useState<number | null>(null);
  const series = weeks.map((w) => w[metric]);
  const max = Math.max(1, ...series);
  const at = hover ?? weeks.length - 1;
  const fmt = (v: number) => (metric === "revenue" ? cad(v) : `${v} ${v === 1 ? "booking" : "bookings"}`);

  return (
    <div className="card chart">
      <div className="chart-head">
        <div className="muted small">Per week</div>
        <div className="pills" role="group" aria-label="Metric">
          {(["revenue", "bookings"] as const).map((m) => (
            <button key={m} type="button" className={`pill${metric === m ? " on" : ""}`} aria-pressed={metric === m} onClick={() => (setMetric(m), setHover(null))}>
              {m === "revenue" ? "Revenue" : "Bookings"}
            </button>
          ))}
        </div>
      </div>
      <div className="readout" aria-live="polite">
        {weeks[at] ? `Week of ${weeks[at].label}: ${fmt(series[at])}` : ""}
      </div>
      <div className="bars" onMouseLeave={() => setHover(null)}>
        {series.map((v, i) => (
          <div key={weeks[i].label} className="bar-col" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`Week of ${weeks[i].label}: ${fmt(v)}`}>
            <span className={`bar${i === at ? " on" : ""}`} style={{ height: `${Math.max(4, Math.round((v / max) * 210))}px` }} />
            <span className="bar-label">{i % 2 === 0 ? weeks[i].label : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
