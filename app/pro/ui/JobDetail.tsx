import type { Provider } from "@/db/schema";
import { timeAgo } from "@/shared/format";
import { ESTIMATE_LABEL, JOB_STATUS_LABELS, SEVERITY_LABELS, priceRange, usd, type ProJobDetail, type ProTab } from "@/shared/scope";
import { tradeArt } from "../art";
import { CalendarLink } from "./Calendar";
import { confidenceTone, Severity, Stars } from "./JobCard";
import { Actions } from "./OfferForm";
import { AdvanceForm, Progress } from "./Schedule";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The open job: what the homeowner said and showed, the spec, the price, and what this pro can do next. */
export function JobDetail({ d, p, tab }: { d: ProJobDetail; p: Provider; tab: ProTab }) {
  const { job, spec, template, quote } = d;
  const mine = job.provider?.id === p.id;
  const shotPrompt = (id: string) => template.required_shots.find((s) => s.id === id)?.prompt ?? id;
  const askedByMe = !job.request?.providerId || job.request.providerId === p.id;
  // The marked photo first, so the homeowner's dot is on the big one.
  const mark = d.scan.mark;
  const photos = mark ? [...d.photos].sort((a, b) => Number(b.shotId === mark.shotId) - Number(a.shotId === mark.shotId)) : d.photos;

  return (
    <section className="detail">
      <div className="dhead">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static icon */}
        <img src={tradeArt(spec.trade)} alt="" />
        <div style={{ minWidth: 0 }}>
          <span className="badge">{JOB_STATUS_LABELS[job.status]}</span>
          <h2 style={{ marginTop: 8 }}>{spec.title}</h2>
          <div className="sub">
            Job #{job.id} · {template.label} · {timeAgo(job.createdAt)} · spec v{spec.version}
            {job.mode === "virtual" ? " · Virtual call" : ""}
          </div>
        </div>
      </div>

      {d.scan.description && (
        <div className="said-card">
          <h4>What they said</h4>
          <blockquote>{d.scan.description}</blockquote>
        </div>
      )}

      {photos.length > 0 && (
        <div className="gallery">
          {photos.map((ph) => (
            <a key={ph.id} href={ph.src} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private photo links */}
              <img src={ph.src} alt={shotPrompt(ph.shotId)} />
              {mark && mark.shotId === ph.shotId && <i className="mark" style={{ left: `${mark.x}%`, top: `${mark.y}%` }} title="The homeowner marked this spot" />}
              <span>
                {mark && mark.shotId === ph.shotId ? "Marked · " : ""}
                {shotPrompt(ph.shotId)}
              </span>
            </a>
          ))}
        </div>
      )}

      {d.fitReason && <p className="why">Why you: {d.fitReason}</p>}

      <div className="card pricecard">
        <div>
          <div className="muted small">Suggested price</div>
          <div className="big">{usd(quote.price)}</div>
          <div className="muted small">{priceRange(quote.low, quote.high)}</div>
        </div>
        {job.price != null && (
          <div>
            <div className="muted small">Confirmed</div>
            <div className="big">{usd(job.price)}</div>
          </div>
        )}
        {d.priceReason && <p className="why">{d.priceReason}</p>}
        <span className="muted small" style={{ flexBasis: "100%" }}>
          {ESTIMATE_LABEL}. {d.priceReason ? "Your profile prices, adjusted for this job." : "From your profile prices."}
        </span>
      </div>

      <div className="facts">
        <div className="fact">
          <span>Severity</span>
          <strong>
            <Severity value={spec.severity} /> {SEVERITY_LABELS[spec.severity]}
          </strong>
        </div>
        <div className="fact">
          <span>{template.output_labels.affected_area_m2 ?? "Area"}</span>
          <strong>{spec.areaM2} m²</strong>
        </div>
        <div className="fact">
          <span>Confidence</span>
          <strong>
            <span className={`badge ${confidenceTone(spec.confidence)}`}>{Math.round(spec.confidence * 100)}%</span>
          </strong>
        </div>
        {Object.entries(spec.fields).map(([k, v]) => (
          <div className="fact" key={k}>
            <span>{template.output_labels[k] ?? k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>

      <div className="card section">
        <h4>AI summary</h4>
        <p>{spec.summary}</p>
        <p className="muted small">{template.policy.finding_wording}</p>
      </div>

      {d.answers.length > 0 && (
        <div className="card section">
          <h4>Homeowner answers</h4>
          <dl>
            {d.answers.map((a) => {
              const own = !template.questions.find((x) => x.id === a.id)?.options.includes(a.answer);
              return (
                <div key={a.id}>
                  <dt>{a.q}</dt>
                  <dd>
                    {a.answer}
                    {own && <span className="muted small"> (their words)</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {(d.scan.notes || d.scan.skippedShots.length > 0) && (
        <div className="card section">
          <h4>Notes</h4>
          {d.scan.notes && <p style={{ whiteSpace: "pre-line" }}>{d.scan.notes}</p>}
          {d.scan.skippedShots.length > 0 && <p className="muted">Skipped: {d.scan.skippedShots.map(shotPrompt).join(", ")}</p>}
        </div>
      )}

      {job.status === "more_info" && job.request && (
        <div className="followup">
          <h4>{askedByMe ? "You asked for more" : "Another pro asked for more"}</h4>
          <p>
            {[...job.request.shotIds.map(shotPrompt), ...job.request.questionIds.map((id) => template.questions.find((x) => x.id === id)?.q ?? id), job.request.message]
              .filter(Boolean)
              .join("; ")}
          </p>
          <p className="small">Waiting for the homeowner. It comes back here with an updated spec when they reply.</p>
        </div>
      )}

      <Actions d={d} p={p} tab={tab} />

      {mine && (job.status === "accepted" || job.status === "en_route" || job.status === "done") && (
        <div className="card act">
          <h3>{job.mode === "virtual" ? "Virtual call" : "Visit"}</h3>
          <Progress status={job.status} virtual={job.mode === "virtual"} />
          {job.slot && (
            <p>
              <strong>{when(job.slot)}</strong>
              {job.mode !== "virtual" && <> · {d.home.address}</>}
              {" · "}
              <CalendarLink d={d} providerName={p.name} />
            </p>
          )}
          <AdvanceForm providerId={p.id} jobId={job.id} status={job.status} virtual={job.mode === "virtual"} tab={tab} />
          {job.rating != null && (
            <p>
              Homeowner rated this <Stars value={job.rating} />
            </p>
          )}
        </div>
      )}
    </section>
  );
}
