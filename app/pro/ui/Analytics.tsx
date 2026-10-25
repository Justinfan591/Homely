import type { Analytics as Data } from "@/lib/scope/pro-pages";
import { AnalyticsChart } from "./AnalyticsChart";

const short = (d: Date) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });

/** Analytics: the last 12 weeks of finished jobs. */
export function Analytics({ data }: { data: Data }) {
  const maxDay = Math.max(1, ...data.days.map((d) => d.count));
  const maxTop = Math.max(1, ...data.top.map((t) => t.count));
  return (
    <>
      <div className="page-head">
        <h1>Analytics</h1>
        <span className="muted">Last 12 weeks</span>
      </div>
      <div className="kpis">
        {data.kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <div className="muted small">{k.label}</div>
            <div className="big">{k.value}</div>
            <div className="small">
              {k.delta ? (
                <>
                  <span className={k.delta.startsWith("+") ? "ok" : "muted"}>{k.delta}</span> <span className="muted">vs the 12 weeks before</span>
                </>
              ) : (
                <span className="muted">&nbsp;</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <AnalyticsChart weeks={data.weeks.map((w) => ({ label: short(w.start), revenue: w.revenue, bookings: w.bookings }))} />
      <div className="an-row">
        <div className="card">
          <div className="muted small">Busiest days</div>
          <div className="days">
            {data.days.map((d) => (
              <div key={d.name} className="day-col">
                <span className="small">{d.count}</span>
                <span className={`bar${d.count === maxDay && d.count > 0 ? " on" : ""}`} style={{ height: `${Math.max(4, Math.round((d.count / maxDay) * 110))}px` }} />
                <span className="muted small">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="muted small">Top jobs</div>
          {data.top.length ? (
            <div className="top">
              {data.top.map((t) => (
                <div key={t.name}>
                  <div className="row-top">
                    <span>{t.name}</span>
                    <span className="muted">{t.count}</span>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${Math.round((t.count / maxTop) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>
              Finished jobs show up here.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
