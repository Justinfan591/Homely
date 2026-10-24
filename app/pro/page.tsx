import Link from "next/link";
import { db, schema } from "@/db";
import type { Provider } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { jobDetail, providerById, queue } from "@/lib/scope/pro";
import { timeAgo } from "@/shared/format";
import {
  ESTIMATE_LABEL,
  JOB_STATUS_LABELS,
  SEVERITY_LABELS,
  priceRange,
  slotLabel,
  usd,
  type ProJobDetail,
  type ProQueueCard,
  type ProTab,
} from "@/shared/scope";
import { googleConfig } from "@/lib/scope/calendar";
import { accept, advance, askMore, decline, disconnectGoogle, saveRates, virtualCall } from "./actions";
import { AutoRefresh } from "./AutoRefresh";
import { proHref } from "./href";
import "./pro.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scope Pro" };

type Search = { provider?: string; tab?: string; job?: string; error?: string; saved?: string; notice?: string };

const TABS: { id: ProTab; label: string }[] = [
  { id: "new", label: "New" },
  { id: "review", label: "Needs review" },
  { id: "active", label: "Active" },
  { id: "done", label: "Done" },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const pct = (c: number) => `${Math.round(c * 100)}%`;
const confidenceLevel = (c: number) => (c >= 0.8 ? "high" : c >= 0.6 ? "medium" : "low");

function provider(id: unknown): Provider | null {
  try {
    return providerById(id);
  } catch (err) {
    if (err instanceof HttpError) return null;
    throw err;
  }
}

/** Opened job, or null if this provider can't see it (any more). */
function detail(p: Provider, id: unknown): ProJobDetail | null {
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId <= 0) return null;
  try {
    return jobDetail(p, jobId);
  } catch (err) {
    if (err instanceof HttpError) return null;
    throw err;
  }
}

export default async function ProPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const p = provider(q.provider);
  if (!p) return <PickProvider />;

  const tabs = queue(p);
  const tab = q.tab === "rates" || (q.tab && q.tab in tabs) ? (q.tab as ProTab | "rates") : "new";
  const selected = q.job ? detail(p, q.job) : null;

  return (
    <div className="pro">
      <AutoRefresh />
      <header className="top">
        <div>
          <h1>{p.name}</h1>
          <span className="muted">
            Provider dashboard · {p.trades.join(", ")} · {p.radiusKm} km radius · ★ {p.rating.toFixed(1)} ({p.ratingCount})
          </span>
        </div>
        <div className="top-right">
          <CalendarStatus p={p} />
          <span className="live">● Live</span>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <Link key={t.id} href={proHref(p.id, { tab: t.id })} className={tab === t.id ? "on" : ""}>
            {t.label} <span className="count">{tabs[t.id].length}</span>
          </Link>
        ))}
        <Link href={proHref(p.id, { tab: "rates" })} className={tab === "rates" ? "on" : ""}>
          Rate card
        </Link>
      </nav>

      {q.error && <p className="error">{q.error}</p>}
      {q.notice && <p className="notice">{q.notice}</p>}

      {tab === "rates" ? (
        <RateCard p={p} saved={!!q.saved} />
      ) : (
        <main className="split">
          <section className="queue">
            {tabs[tab].length === 0 && <p className="empty">Nothing here right now. New jobs show up automatically.</p>}
            {tabs[tab].map((c) => (
              <QueueCard key={c.jobId} card={c} providerId={p.id} tab={tab} selected={c.jobId === selected?.job.id} />
            ))}
          </section>
          <section className="detail">
            {selected ? <SpecDetail d={selected} p={p} tab={tab} /> : <p className="empty">Select a job to open its spec.</p>}
          </section>
        </main>
      )}
    </div>
  );
}

function PickProvider() {
  const providers = db.select().from(schema.providers).all();
  return (
    <div className="pro narrow">
      <h1>Scope Pro</h1>
      <p className="muted">
        Pick the provider to run the dashboard as. The link keeps it (<code>?provider=&lt;id&gt;</code>).
      </p>
      <div className="card">
        {providers.length === 0 && <p className="muted">No providers yet. Run npm run setup.</p>}
        {providers.map((x) => (
          <Link key={x.id} href={proHref(x.id)} className="row-link">
            {x.name} <span className="muted">· {x.trades.join(", ")} · id {x.id}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Severity({ value }: { value: number }) {
  return (
    <span className="sev" title={`Severity ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : ""} />
      ))}
    </span>
  );
}

function Confidence({ value }: { value: number }) {
  return <span className={`badge conf-${confidenceLevel(value)}`}>{pct(value)} confidence</span>;
}

function QueueCard({ card: c, providerId, tab, selected }: { card: ProQueueCard; providerId: number; tab: ProTab; selected: boolean }) {
  return (
    <Link href={proHref(providerId, { tab, job: c.jobId })} className={`card qcard ${selected ? "selected" : ""}`}>
      <div className="qtop">
        <strong>{c.tradeLabel}</strong>
        <span className="muted">{timeAgo(c.createdAt)}</span>
      </div>
      <div className="qtitle">{c.title}</div>
      <div className="qmeta">
        <Severity value={c.severity} />
        <span>{c.areaM2} m²</span>
        <span>{priceRange(c.quote.low, c.quote.high)}</span>
        <span className="muted">{c.distanceKm} km</span>
      </div>
      <div className="qmeta">
        <Confidence value={c.confidence} />
        {c.status === "more_info" && <span className="badge wait">Waiting for homeowner</span>}
        {c.status === "handoff" && <span className="badge handoff">Handoff</span>}
        {c.status === "virtual_call" && <span className="badge">Virtual call</span>}
        {tab === "active" && <span className="badge">{JOB_STATUS_LABELS[c.status]}</span>}
      </div>
    </Link>
  );
}

function SpecDetail({ d, p, tab }: { d: ProJobDetail; p: Provider; tab: ProTab }) {
  const { job, spec, template, quote } = d;
  const status = job.status;
  const mine = job.provider?.id === p.id;
  const shotPrompt = (id: string) => template.required_shots.find((s) => s.id === id)?.prompt ?? id;
  const hidden = (
    <>
      <input type="hidden" name="provider" value={p.id} />
      <input type="hidden" name="job" value={job.id} />
      <input type="hidden" name="tab" value={tab} />
    </>
  );
  const open = ["pending", "handoff", "virtual_call"].includes(status);
  const steps = job.mode === "virtual" ? (["accepted", "done"] as const) : (["accepted", "en_route", "done"] as const);
  const next = status === "accepted" ? (job.mode === "virtual" ? "done" : "en_route") : status === "en_route" ? "done" : null;

  return (
    <div className="card spec">
      <div className="qtop">
        <span className="muted">
          Job #{job.id} · {template.label} · {timeAgo(job.createdAt)} · spec v{spec.version}
        </span>
        <span className="badge">{JOB_STATUS_LABELS[status]}</span>
      </div>
      <h2>{spec.title}</h2>
      <div className="qmeta">
        <Severity value={spec.severity} /> <span>{SEVERITY_LABELS[spec.severity]}</span>
        <span>{spec.areaM2} m²</span>
        <Confidence value={spec.confidence} />
        {job.mode === "virtual" && <span className="badge">Virtual call</span>}
      </div>

      <div className="price">
        <div>
          <span className="muted">Calculated price</span>
          <strong>{priceRange(quote.low, quote.high)}</strong>
        </div>
        {job.price != null && (
          <div>
            <span className="muted">Confirmed</span>
            <strong>{usd(job.price)}</strong>
          </div>
        )}
        <span className="muted small">{ESTIMATE_LABEL}. From your rate card, not the AI.</span>
      </div>

      {d.photos.length > 0 && (
        <div className="photos">
          {d.photos.map((ph) => (
            <a key={ph.id} href={ph.src} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private photo links */}
              <img src={ph.src} alt={shotPrompt(ph.shotId)} />
              <span>{shotPrompt(ph.shotId)}</span>
            </a>
          ))}
        </div>
      )}

      <div>
        <h4>AI summary</h4>
        <p>{spec.summary}</p>
        <p className="muted small">{template.policy.finding_wording}</p>
      </div>
      {Object.keys(spec.fields).length > 0 && (
        <div>
          <h4>Extracted fields</h4>
          <dl>
            {Object.entries(spec.fields).map(([k, v]) => (
              <div key={k}>
                <dt>{template.output_labels[k] ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {d.answers.length > 0 && (
        <div>
          <h4>Homeowner answers</h4>
          <dl>
            {d.answers.map((a) => (
              <div key={a.id}>
                <dt>{a.q}</dt>
                <dd>{a.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {(d.scan.notes || d.scan.skippedShots.length > 0) && (
        <div>
          <h4>Notes</h4>
          {d.scan.notes && <p style={{ whiteSpace: "pre-line" }}>{d.scan.notes}</p>}
          {d.scan.skippedShots.length > 0 && <p className="muted">Skipped: {d.scan.skippedShots.map(shotPrompt).join(", ")}</p>}
        </div>
      )}
      {status === "more_info" && job.request && (
        <div className="followup">
          <h4>You asked for more</h4>
          <p>
            {[...job.request.shotIds.map(shotPrompt), ...job.request.questionIds.map((id) => template.questions.find((x) => x.id === id)?.q ?? id), job.request.message]
              .filter(Boolean)
              .join("; ")}
          </p>
          <p className="muted">Waiting for the homeowner. It comes back here with an updated spec when they reply.</p>
        </div>
      )}

      {open && (
        <div className="actions">
          <details>
            <summary className="btn primary">{status === "virtual_call" ? "Accept the call" : "Accept"}</summary>
            <form action={accept} className="panel">
              {hidden}
              <fieldset>
                <legend>Time slot</legend>
                {d.slots.map((s, i) => (
                  <label key={s.startsAt}>
                    <input type="radio" name="slot" value={s.startsAt} defaultChecked={i === 0} /> {slotLabel(s.startsAt)}
                    {s.id === "requested" && <span className="badge">Homeowner&apos;s pick</span>}
                  </label>
                ))}
              </fieldset>
              <label>
                Price (USD, {priceRange(quote.low, quote.high)})
                <input type="number" name="price" min={quote.low} max={quote.high} step="1" defaultValue={quote.price} required />
              </label>
              <button className="btn primary">Confirm booking</button>
            </form>
          </details>
          <details>
            <summary className="btn">Ask for more</summary>
            <form action={askMore} className="panel">
              {hidden}
              <fieldset>
                <legend>Photos to retake or add</legend>
                {template.required_shots.map((s) => (
                  <label key={s.id}>
                    <input type="checkbox" name="shots" value={s.id} /> {s.prompt}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Questions to ask again</legend>
                {template.questions.map((x) => (
                  <label key={x.id}>
                    <input type="checkbox" name="questions" value={x.id} /> {x.q}
                  </label>
                ))}
              </fieldset>
              <label>
                Anything else?
                <textarea name="message" rows={3} placeholder="e.g. Is the wall soft to the touch?" maxLength={1000} />
              </label>
              <button className="btn primary">Send to homeowner</button>
            </form>
          </details>
          {status === "handoff" ? (
            <form action={virtualCall}>
              {hidden}
              <button className="btn">Route to a virtual call</button>
            </form>
          ) : (
            <form action={decline}>
              {hidden}
              <button className="btn ghost">Decline</button>
            </form>
          )}
        </div>
      )}

      {mine && (status === "accepted" || status === "en_route" || status === "done") && (
        <div className="active">
          <ol className="stepper">
            {steps.map((s, i) => (
              <li key={s} className={i <= (steps as readonly string[]).indexOf(status) ? "on" : ""}>
                {JOB_STATUS_LABELS[s]}
              </li>
            ))}
          </ol>
          {job.slot && (
            <p>
              {job.mode === "virtual" ? "Virtual call" : "Visit"}: <strong>{when(job.slot)}</strong>
              {job.mode !== "virtual" && <> · {d.home.address}</>}
              {" · "}
              {d.calendarLink ? (
                <a href={d.calendarLink} target="_blank" rel="noreferrer">
                  In your Google Calendar ↗
                </a>
              ) : (
                <a href={googleCalendarUrl(d, p.name)} target="_blank" rel="noreferrer">
                  Add to Google Calendar
                </a>
              )}
            </p>
          )}
          {job.rating != null && <p>Homeowner rated this {"★".repeat(job.rating)}</p>}
          {next && (
            <form action={advance}>
              {hidden}
              <input type="hidden" name="to" value={next} />
              <button className="btn primary">{next === "en_route" ? "On my way" : "Mark done"}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Connected calendar, a Connect button, or a setup hint when the OAuth client isn't configured. */
function CalendarStatus({ p }: { p: Provider }) {
  if (p.googleCalendar) {
    return (
      <form action={disconnectGoogle} className="cal">
        <input type="hidden" name="provider" value={p.id} />
        <span>📅 Google Calendar: {p.googleCalendar}</span>
        <button className="btn ghost small-btn">Disconnect</button>
      </form>
    );
  }
  if (!googleConfig()) return <span className="muted small">Google Calendar: set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (README)</span>;
  return (
    <a className="btn small-btn" href={`/pro/google/connect?provider=${p.id}`}>
      📅 Connect Google Calendar
    </a>
  );
}

/** Fallback when the pro hasn't connected: a prefilled "add to Google Calendar" link. No OAuth needed. */
function googleCalendarUrl(d: ProJobDetail, providerName: string) {
  const fmt = (x: Date) => x.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const start = new Date(d.job.slot!);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${providerName}: ${d.spec.title}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Scope job #${d.job.id}\n\n${d.spec.summary}`,
    location: d.job.mode === "virtual" ? "Virtual call" : d.home.address,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function RateCard({ p, saved }: { p: Provider; saved: boolean }) {
  const c = p.rateCard;
  return (
    <form action={saveRates} className="card narrow-card">
      <input type="hidden" name="provider" value={p.id} />
      <h2>Rate card</h2>
      <p className="muted">Prices = (base + per m² × area) × severity multiplier, shown as a ±15% range. Saving re-prices every spec in your queue.</p>
      <div className="grid2">
        <label>
          Base ($)
          <input type="number" name="base" min={0} step="any" defaultValue={c.base} required />
        </label>
        <label>
          Per m² ($)
          <input type="number" name="per_m2" min={0} step="any" defaultValue={c.per_m2} required />
        </label>
      </div>
      <fieldset>
        <legend>Severity multiplier</legend>
        <div className="grid5">
          {[1, 2, 3, 4, 5].map((s) => (
            <label key={s}>
              {SEVERITY_LABELS[s]} ({s})
              <input type="number" name={`m${s}`} min={0} max={20} step="any" defaultValue={c.severity_multiplier[s - 1] ?? 1} required />
            </label>
          ))}
        </div>
      </fieldset>
      {saved && <p className="ok">Saved. New prices apply now.</p>}
      <button className="btn primary">Save rate card</button>
    </form>
  );
}
