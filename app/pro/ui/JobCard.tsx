import Link from "next/link";
import { timeAgo } from "@/shared/format";
import { JOB_STATUS_LABELS, SEVERITY_LABELS, slotLabel, usd, type ProQueueCard, type ProTab } from "@/shared/scope";
import { allArt, tradeArt } from "../art";
import { proHref } from "../href";

/** The 5-dot severity bar. */
export function Severity({ value }: { value: number }) {
  return (
    <span className="sev" title={`Severity ${value}/5`} aria-label={`Severity ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : ""} />
      ))}
    </span>
  );
}

export const confidenceTone = (c: number) => (c >= 0.8 ? "good" : c >= 0.6 ? "" : "bad");

/** One job in a list. Only a link: no price or slot inputs here (the e2e test reads the first price input on the page). */
export function JobCard({ card: c, providerId, tab, selected }: { card: ProQueueCard; providerId: number; tab: ProTab; selected: boolean }) {
  return (
    <Link href={proHref(providerId, { tab, job: c.jobId })} className={`card jcard ${selected ? "selected" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static icon */}
      <img className="art" src={tradeArt(c.trade)} alt="" />
      <div style={{ minWidth: 0 }}>
        <div className="t">{c.title}</div>
        {c.description && <div className="said">“{c.description}”</div>}
        <div className="meta">
          <span>
            <Severity value={c.severity} /> {SEVERITY_LABELS[c.severity]}
          </span>
          <span>{c.areaM2} m²</span>
          <span>{c.distanceKm} km</span>
          <span>{timeAgo(c.createdAt)}</span>
        </div>
      </div>
      <div className="price">
        <strong>{usd(c.quote.price)}</strong>
        <span className="muted small">suggested</span>
      </div>
      <div className="badges">
        {c.status === "open" && <span className="badge">Open for offers · {c.invitedCount} pros</span>}
        {c.status === "open" && <OfferBadge offer={c.myOffer} />}
        {c.status === "more_info" && <span className="badge warn">Waiting for homeowner</span>}
        {c.status === "pending" && <span className="badge ink">Booked you · confirm the time</span>}
        {c.status === "handoff" && <span className="badge bad">Handoff</span>}
        {c.status === "virtual_call" && <span className="badge">Virtual call</span>}
        {c.confidence < 0.6 && c.status !== "handoff" && <span className="badge bad">Low confidence</span>}
        {(tab === "active" || tab === "done") && <span className="badge">{JOB_STATUS_LABELS[c.status]}</span>}
        {c.rating != null && <Stars value={c.rating} />}
      </div>
    </Link>
  );
}

/** This pro's offer on an open request, as a short badge. */
function OfferBadge({ offer: o }: { offer: ProQueueCard["myOffer"] }) {
  if (!o || o.status === "withdrawn") return <span className="badge">No offer yet</span>;
  if (o.status === "stale") return <span className="badge warn">Spec updated · re-send offer</span>;
  return (
    <span className="badge good">
      Your offer: {usd(o.price)} · {slotLabel(o.slot)}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`${value} of 5 stars`}>
      {"★".repeat(value)}
      <span className="off">{"★".repeat(5 - value)}</span>
    </span>
  );
}

/** Nothing to show: a little pile of trade icons and a line of text. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card empty">
      <div className="pile" aria-hidden="true">
        {allArt.slice(0, 3).map((src) => (
          // eslint-disable-next-line @next/next/no-img-element -- decorative static icons
          <img key={src} src={src} alt="" />
        ))}
      </div>
      <p>{children}</p>
    </div>
  );
}
