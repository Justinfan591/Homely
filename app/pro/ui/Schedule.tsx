import Link from "next/link";
import { JOB_STATUS_LABELS, type ProQueueCard, type ScopeJobStatus } from "@/shared/scope";
import { advance } from "../actions";
import { tradeArt } from "../art";
import { proHref } from "../href";
import { googleCalendarUrl } from "./Calendar";
import { Empty } from "./JobCard";

const dayKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayTitle(iso: string | null) {
  if (!iso) return "Time to be confirmed";
  const d = new Date(iso);
  const diff = Math.round((dayKey(d) - dayKey(new Date())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return "Earlier";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Booked → On the way → Done (virtual calls skip the middle step). */
export function Progress({ status, virtual }: { status: ScopeJobStatus; virtual: boolean }) {
  const steps = virtual ? (["accepted", "done"] as const) : (["accepted", "en_route", "done"] as const);
  const at = (steps as readonly string[]).indexOf(status);
  return (
    <div>
      <div className="steps">
        {steps.map((s, i) => (
          <i key={s} className={i <= at ? "on" : ""} />
        ))}
      </div>
      <div className="steps-labels">
        {steps.map((s) => (
          <span key={s}>{JOB_STATUS_LABELS[s]}</span>
        ))}
      </div>
    </div>
  );
}

/** "On my way" / "Mark done" for an accepted job. */
export function AdvanceForm({ providerId, jobId, status, virtual, tab }: { providerId: number; jobId: number; status: ScopeJobStatus; virtual: boolean; tab: string }) {
  const next = status === "accepted" ? (virtual ? "done" : "en_route") : status === "en_route" ? "done" : null;
  if (!next) return null;
  return (
    <form action={advance}>
      <input type="hidden" name="provider" value={providerId} />
      <input type="hidden" name="job" value={jobId} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="to" value={next} />
      <button className="btn primary">{next === "en_route" ? "On my way" : "Mark done"}</button>
    </form>
  );
}

/** The Active tab as a day-by-day list of visits and calls. */
export function Schedule({ cards, providerId, providerName, selected }: { cards: ProQueueCard[]; providerId: number; providerName: string; selected: number | null }) {
  if (!cards.length) return <Empty>No visits booked yet. Accepted jobs show up here by day.</Empty>;
  const sorted = [...cards].sort((a, b) => (a.slot ?? "9").localeCompare(b.slot ?? "9"));
  const days = new Map<string, ProQueueCard[]>();
  for (const c of sorted) days.set(dayTitle(c.slot), [...(days.get(dayTitle(c.slot)) ?? []), c]);

  return (
    <div>
      {[...days].map(([title, list]) => (
        <section key={title} className="day">
          <h3>{title}</h3>
          {list.map((c) => {
            const virtual = c.mode === "virtual";
            return (
              <div key={c.jobId} className={`card visit ${c.jobId === selected ? "selected" : ""}`}>
                <Link href={proHref(providerId, { tab: "active", job: c.jobId })} className="time" style={{ textDecoration: "none" }}>
                  {c.slot ? new Date(c.slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—"}
                  <small>{virtual ? "Video call" : `${c.distanceKm} km`}</small>
                </Link>
                <Link href={proHref(providerId, { tab: "active", job: c.jobId })} style={{ textDecoration: "none", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static icon */}
                    <img src={tradeArt(c.trade)} alt="" width={40} height={40} style={{ objectFit: "contain" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{c.title}</div>
                      <div className="muted small">{virtual ? "Virtual call" : (c.address ?? "")}</div>
                    </div>
                  </div>
                  <Progress status={c.status} virtual={virtual} />
                </Link>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <AdvanceForm providerId={providerId} jobId={c.jobId} status={c.status} virtual={virtual} tab="active" />
                  {c.slot && (
                    <a className="small muted" href={googleCalendarUrl({ id: c.jobId, slot: c.slot, mode: c.mode }, c.title, "", c.address ?? "", providerName)} target="_blank" rel="noreferrer">
                      Add to calendar
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
