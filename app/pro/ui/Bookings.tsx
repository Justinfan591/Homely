import Link from "next/link";
import type { Provider } from "@/db/schema";
import type { ProBooking } from "@/lib/scope/pro-pages";
import { cad, JOB_STATUS_LABELS, type ProJobDetail } from "@/shared/scope";
import { advance } from "../actions";
import { proHref } from "../href";
import { SubmitButton } from "../SubmitButton";
import { CalendarLink } from "./Calendar";
import { Estimate } from "./Estimate";
import { Empty } from "./JobCard";

/** "Thu, Oct 29 · 9:00 a.m." */
export const whenLong = (d: Date | null) =>
  d ? `${d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}` : "Time to be confirmed";

/** "Thu 9:00 a.m." this week, else "Nov 3". */
export const whenShort = (d: Date | null) => {
  if (!d) return "To be confirmed";
  const today = new Date(new Date().toDateString()).getTime();
  const days = Math.round((new Date(d.toDateString()).getTime() - today) / 86_400_000);
  if (days >= 0 && days < 7) return `${d.toLocaleDateString("en-CA", { weekday: "short" })} ${d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
};

/** Bookings: Upcoming / Past list, and the selected visit with photos, summary, answers and the agent's estimate. */
export function Bookings({
  p,
  list,
  show,
  selected,
}: {
  p: Provider;
  list: { upcoming: ProBooking[]; past: ProBooking[] };
  show: "upcoming" | "past";
  selected: ProJobDetail | null;
}) {
  const items = list[show];
  return (
    <>
      <div className="page-head">
        <h1>Bookings</h1>
      </div>
      <div className="bk">
        <section aria-label="Bookings list" className="bk-list">
          <div className="pills" role="group" aria-label="Show">
            {(["upcoming", "past"] as const).map((k) => (
              <Link key={k} href={proHref(p.id, { tab: "bookings", show: k })} className={`pill${show === k ? " on" : ""}`} aria-pressed={show === k}>
                {k === "upcoming" ? "Upcoming" : "Past"}
              </Link>
            ))}
          </div>
          {items.length ? (
            <div className="rows-card">
              {items.map((b) => {
                const on = selected?.job.id === b.jobId;
                return (
                  <Link key={b.jobId} href={proHref(p.id, { tab: "bookings", show, job: b.jobId })} className={`row${on ? " on" : ""}`} aria-current={on || undefined}>
                    <div className="row-top">
                      <span className="row-name">{b.client}</span>
                      <span className="muted">{cad(b.price)}</span>
                    </div>
                    <div className="muted small">
                      {b.service} · {whenShort(b.slot)}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty>{show === "upcoming" ? "No visits booked yet. Accepted offers show up here." : "No finished jobs yet."}</Empty>
          )}
        </section>
        {selected ? (
          <BookingDetail p={p} d={selected} show={show} />
        ) : (
          items.length > 0 && <Empty>Pick a booking to see the photos, answers and the agent&apos;s estimate.</Empty>
        )}
      </div>
    </>
  );
}

function BookingDetail({ p, d, show }: { p: Provider; d: ProJobDetail; show: string }) {
  const { job, spec, quote } = d;
  const next = job.status === "accepted" && job.mode !== "virtual" ? "en_route" : job.status === "accepted" || job.status === "en_route" ? "done" : null;
  return (
    <section aria-label="Booking details" className="bk-detail">
      <div className="bk-sec">
        <div className="bk-name">{d.client}</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 17 }}>
          {spec.title}
        </div>
        <div style={{ marginTop: 14, lineHeight: 1.5 }}>
          {whenLong(job.slot ? new Date(job.slot) : null)}
          <br />
          {d.home.address}
        </div>
        <div className="row-actions">
          <span className="badge">{JOB_STATUS_LABELS[job.status]}</span>
          {next && (
            <form action={advance}>
              <input type="hidden" name="provider" value={p.id} />
              <input type="hidden" name="job" value={job.id} />
              <input type="hidden" name="to" value={next} />
              <input type="hidden" name="tab" value="bookings" />
              <input type="hidden" name="show" value={show} />
              <SubmitButton className="btn primary small-btn" pending="Saving…">
                {next === "en_route" ? "I'm on my way" : "Mark as done"}
              </SubmitButton>
            </form>
          )}
          {job.status !== "done" && <CalendarLink d={d} providerName={p.name} />}
        </div>
      </div>
      {d.photos.length > 0 && (
        <div className="bk-sec">
          <div className="muted small">Photos</div>
          <div className="bk-photos">
            {d.photos.map((ph) => {
              const shot = d.template.required_shots.find((s) => s.id === ph.shotId);
              return (
                <a key={ph.id} href={ph.src} target="_blank" rel="noreferrer" className="bk-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed photo links */}
                  <img src={ph.src} alt={shot?.prompt ?? ph.shotId} />
                  <span>{shot?.prompt ?? ph.shotId}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
      <div className="bk-sec">
        <div className="muted small">Summary</div>
        <p style={{ marginTop: 6, lineHeight: 1.5 }}>{spec.summary}</p>
        {d.answers.map((a) => (
          <div key={a.id} className="qa">
            <span className="muted">{a.q}</span>
            <strong>{a.answer}</strong>
          </div>
        ))}
      </div>
      <div className="bk-sec">
        <Estimate quote={quote} spec={spec} />
        {job.price != null && job.price !== quote.price && <p className="muted small" style={{ marginTop: 10 }}>Booked at {cad(job.price)}.</p>}
      </div>
    </section>
  );
}
