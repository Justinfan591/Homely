import Link from "next/link";
import type { Provider } from "@/db/schema";
import type { ProBooking } from "@/lib/scope/pro-pages";
import { cad } from "@/shared/scope";
import { proHref } from "../href";
import { whenLong } from "./Bookings";
import { CalendarStatus } from "./Calendar";

const FIRST_HOUR = 8;
const LAST_HOUR = 18;
const ROW = 56;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "pm" : "am"}`;

/** Calendar: this week's visits, Monday to Saturday, 8 am to 6 pm, with the picked one's details. */
export function WeekCalendar({ p, start, items, week, selected }: { p: Provider; start: Date; items: ProBooking[]; week: number; selected: number | null }) {
  const day = (i: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const first = day(0);
  const last = day(5);
  const label = `${MONTHS[first.getMonth()]} ${first.getDate()} – ${last.getMonth() !== first.getMonth() ? `${MONTHS[last.getMonth()]} ` : ""}${last.getDate()}`;
  const sel = items.find((b) => b.jobId === selected) ?? items[0] ?? null;
  const now = new Date();

  return (
    <>
      <div className="page-head">
        <h1>Calendar</h1>
        <div className="week-nav">
          <Link className="btn small-btn" href={proHref(p.id, { tab: "calendar", week: week - 1 })} aria-label="Previous week">
            ‹
          </Link>
          <span className="week-label">{label}</span>
          <Link className="btn small-btn" href={proHref(p.id, { tab: "calendar", week: week + 1 })} aria-label="Next week">
            ›
          </Link>
          {week !== 0 && (
            <Link className="btn ghost small-btn" href={proHref(p.id, { tab: "calendar" })}>
              This week
            </Link>
          )}
        </div>
      </div>

      <div className="cal-wrap">
        <div className="card cal-grid" style={{ gridTemplateRows: `auto ${(LAST_HOUR - FIRST_HOUR) * ROW}px` }}>
          <div />
          {DAYS.map((name, i) => {
            const d = day(i);
            const today = d.toDateString() === now.toDateString();
            return (
              <div key={name} className={`cal-head${today ? " today" : ""}`}>
                <span className="muted small">{name}</span>
                <strong>{d.getDate()}</strong>
              </div>
            );
          })}
          <div className="cal-hours">
            {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
              <span key={i} style={{ height: ROW }}>
                {hourLabel(FIRST_HOUR + i)}
              </span>
            ))}
          </div>
          {DAYS.map((name, i) => {
            const d = day(i);
            const mine = items.filter((b) => b.slot && b.slot.toDateString() === d.toDateString());
            return (
              <div key={name} className="cal-col" style={{ backgroundSize: `100% ${ROW}px` }}>
                {mine.map((b) => {
                  const h = b.slot!.getHours() + b.slot!.getMinutes() / 60;
                  const top = Math.max(0, (h - FIRST_HOUR) * ROW);
                  const height = Math.max(ROW / 2, Math.min(b.hours, LAST_HOUR - Math.max(h, FIRST_HOUR)) * ROW - 4);
                  return (
                    <Link
                      key={b.jobId}
                      href={proHref(p.id, { tab: "calendar", week, job: b.jobId })}
                      className={`cal-item${sel?.jobId === b.jobId ? " on" : ""}${b.status === "done" ? " past" : ""}`}
                      style={{ top: top + 2, height }}
                    >
                      <span className="small">{b.slot!.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</span>
                      <strong>{b.client}</strong>
                      <span className="small">{b.service}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        <aside className="card cal-side">
          {sel ? (
            <>
              <div className="bk-name" style={{ fontSize: 24 }}>
                {sel.client}
              </div>
              <div className="muted">{sel.service}</div>
              <div style={{ lineHeight: 1.5 }}>
                {whenLong(sel.slot)}
                <br />
                {sel.address}
              </div>
              <div className="big">{cad(sel.price)}</div>
              <Link className="btn primary" href={proHref(p.id, { tab: "bookings", show: sel.status === "done" ? "past" : "upcoming", job: sel.jobId })}>
                View details
              </Link>
            </>
          ) : (
            <p className="muted">No bookings this week.</p>
          )}
          <div className="cal-google">
            <CalendarStatus p={p} />
          </div>
        </aside>
      </div>
    </>
  );
}
