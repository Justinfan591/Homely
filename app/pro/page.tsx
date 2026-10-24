import Link from "next/link";
import { money, timeAgo } from "@/shared/format";
import { STATUS_LABELS, TRADE_LABELS, type Trade } from "@/shared/types";
import { severityOf } from "@/lib/pricing";
import {
  allProviders,
  customerOf,
  googleCalendarUrl,
  jobPhotos,
  priceFor,
  proProvider,
  proQueue,
  slotOptions,
  type Pro,
  type ProJob,
  type Tab,
} from "@/lib/pro";
import { accept, advance, askMore, decline, saveRates, virtualCall } from "./actions";
import { AutoRefresh } from "./AutoRefresh";
import { proHref } from "./href";
import "./pro.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Molsters Pro" };

type Search = { provider?: string; tab?: string; job?: string; error?: string; saved?: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "new", label: "New" },
  { id: "review", label: "Needs review" },
  { id: "active", label: "Active" },
  { id: "done", label: "Done" },
];

// From the mold template's required shots; the free-text box covers anything else.
const SHOT_SUGGESTIONS = [
  "Wide shot of the whole room",
  "Close-up of the affected spot",
  "The ceiling above it",
  "The wall next to it",
  "Any window, pipe or vent nearby",
];

const STEPS = ["assigned", "en_route", "in_progress", "completed"] as const;
const NEXT: Record<string, { to: string; label: string }> = {
  assigned: { to: "en_route", label: "On my way" },
  en_route: { to: "in_progress", label: "Arrived — start work" },
  in_progress: { to: "completed", label: "Mark done" },
};

const when = (d: Date) => d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const usd = (n: number) => money({ min: n, max: n });

export default async function ProPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const pro = proProvider(q.provider);
  if (!pro) return <PickProvider />;

  const queue = proQueue(pro);
  const tab = q.tab === "rates" || (q.tab && q.tab in queue) ? (q.tab as Tab | "rates") : "new";
  const list = tab === "rates" ? [] : queue[tab];
  const selected = Object.values(queue).flat().find((j) => j.id === Number(q.job));
  const name = pro.profile.businessName ?? pro.user.name;

  return (
    <div className="pro">
      <AutoRefresh />
      <header className="top">
        <div>
          <h1>{name}</h1>
          <span className="muted">Provider dashboard · {pro.user.name}</span>
        </div>
        <span className="live">● Live</span>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <Link key={t.id} href={proHref(pro.user.id, { tab: t.id })} className={tab === t.id ? "on" : ""}>
            {t.label} <span className="count">{queue[t.id].length}</span>
          </Link>
        ))}
        <Link href={proHref(pro.user.id, { tab: "rates" })} className={tab === "rates" ? "on" : ""}>
          Rate card
        </Link>
      </nav>

      {q.error && <p className="error">{q.error}</p>}

      {tab === "rates" ? (
        <RateCard pro={pro} saved={!!q.saved} />
      ) : (
        <main className="split">
          <section className="queue">
            {list.length === 0 && <p className="empty">Nothing here right now. New jobs show up automatically.</p>}
            {list.map((j) => (
              <QueueCard key={j.id} job={j} pro={pro} tab={tab} selected={j.id === selected?.id} />
            ))}
          </section>
          <section className="detail">
            {selected ? <SpecDetail job={selected} pro={pro} tab={tab} /> : <p className="empty">Select a job to open its spec.</p>}
          </section>
        </main>
      )}
    </div>
  );
}

function PickProvider() {
  return (
    <div className="pro narrow">
      <h1>Molsters Pro</h1>
      <p className="muted">Pick the provider to run the dashboard as. The link keeps it (<code>?provider=&lt;id&gt;</code>).</p>
      <div className="card">
        {allProviders().map((p) => (
          <Link key={p.id} href={proHref(p.id)} className="row-link">
            {p.businessName ?? p.name} <span className="muted">· {p.name} · id {p.id}</span>
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

function Confidence({ level }: { level: string }) {
  return <span className={`badge conf-${level}`}>{level} confidence</span>;
}

function QueueCard({ job, pro, tab, selected }: { job: ProJob; pro: Pro; tab: Tab; selected: boolean }) {
  const r = job.report;
  const range = priceFor(job, pro);
  return (
    <Link href={proHref(pro.user.id, { tab, job: job.id })} className={`card qcard ${selected ? "selected" : ""}`}>
      <div className="qtop">
        <strong>{TRADE_LABELS[r.category as Trade] ?? r.category}</strong>
        <span className="muted">{timeAgo(job.createdAt)}</span>
      </div>
      <div className="qtitle">{r.title}</div>
      <div className="qmeta">
        <Severity value={severityOf(r)} />
        <span>{r.affected_area_m2 ? `${r.affected_area_m2} m²` : "— m²"}</span>
        <span>{job.price != null ? usd(job.price) : `${usd(range.low)}–${usd(range.high)}`}</span>
        <span className="muted">ZIP {job.zip}</span>
      </div>
      <div className="qmeta">
        <Confidence level={r.confidence} />
        {job.status === "more_info" && <span className="badge wait">Waiting for homeowner</span>}
        {job.status === "agent_review" && <span className="badge handoff">Handoff</span>}
        {tab === "active" && <span className="badge">{STATUS_LABELS[job.status]}</span>}
      </div>
    </Link>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function SpecDetail({ job, pro, tab }: { job: ProJob; pro: Pro; tab: Tab }) {
  const r = job.report;
  const range = priceFor(job, pro);
  const photos = jobPhotos(job.id);
  const mine = job.providerId === pro.user.id;
  const hidden = (
    <>
      <input type="hidden" name="provider" value={pro.user.id} />
      <input type="hidden" name="job" value={job.id} />
      <input type="hidden" name="tab" value={tab} />
    </>
  );

  return (
    <div className="card spec">
      <div className="qtop">
        <span className="muted">
          #{job.id} · {TRADE_LABELS[r.category as Trade] ?? r.category} · {timeAgo(job.createdAt)}
        </span>
        <span className="badge">{STATUS_LABELS[job.status]}</span>
      </div>
      <h2>{r.title}</h2>
      <div className="qmeta">
        <Severity value={severityOf(r)} /> <span>Severity {severityOf(r)}/5</span>
        <span>{r.affected_area_m2 ? `${r.affected_area_m2} m²` : "Area n/a"}</span>
        <Confidence level={r.confidence} />
      </div>

      <div className="price">
        <div>
          <span className="muted">Calculated price</span>
          <strong>
            {usd(range.low)}–{usd(range.high)}
          </strong>
        </div>
        {job.price != null && (
          <div>
            <span className="muted">Confirmed</span>
            <strong>{usd(job.price)}</strong>
          </div>
        )}
        <span className="muted small">Estimate — confirmed by provider. From your rate card, not the AI.</span>
      </div>

      {photos.length > 0 && (
        <div className="photos">
          {photos.map((p, i) => (
            <a key={p.id} href={`/pro/photos/${p.id}?provider=${pro.user.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- private photos served by our own route */}
              <img src={`/pro/photos/${p.id}?provider=${pro.user.id}`} alt={p.label ?? `Photo ${i + 1}`} />
              <span>{p.label || `Photo ${i + 1}`}</span>
            </a>
          ))}
        </div>
      )}

      <div>
        <h4>AI summary</h4>
        <p>{r.summary}</p>
      </div>
      <List title="Safety" items={r.safety_hazards} />
      <List title="What the photos show" items={r.observed_issues} />
      <List title="Possible causes" items={r.likely_causes} />
      <List title="Work needed" items={r.scope_of_work} />
      <List title="Parts & materials" items={r.materials_likely} />
      {r.access_notes && (
        <div>
          <h4>Access</h4>
          <p>{r.access_notes}</p>
        </div>
      )}
      {r.customer_answers.length > 0 && (
        <div>
          <h4>Homeowner answers</h4>
          <dl>
            {r.customer_answers.map((a, i) => (
              <div key={i}>
                <dt>{a.question}</dt>
                <dd>{a.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {job.moreInfo && (
        <div className="followup">
          <h4>Follow-up from {job.moreInfo.providerName}</h4>
          <p>Asked for: {[...job.moreInfo.shots, job.moreInfo.message].filter(Boolean).join("; ")}</p>
          {job.status === "more_info" ? (
            <p className="muted">Waiting for the homeowner. It moves back to New when they reply.</p>
          ) : (
            <p>Reply: {job.moreInfo.reply || "(photos only)"}</p>
          )}
        </div>
      )}

      {(job.status === "open" || job.status === "agent_review") && (
        <div className="actions">
          <details>
            <summary className="btn primary">Accept</summary>
            <form action={accept} className="panel">
              {hidden}
              <fieldset>
                <legend>Time slot</legend>
                {slotOptions().map((s, i) => (
                  <label key={s.toISOString()}>
                    <input type="radio" name="slot" value={s.toISOString()} defaultChecked={i === 0} /> {when(s)}
                  </label>
                ))}
              </fieldset>
              <label>
                Price (USD, {usd(range.low)}–{usd(range.high)})
                <input type="number" name="price" min={range.low} max={range.high} step="1" defaultValue={range.price} required />
              </label>
              <div className="row">
                <button className="btn primary">Confirm booking</button>
                {job.status === "agent_review" && (
                  <button className="btn" formAction={virtualCall} formNoValidate>
                    Book a virtual call instead
                  </button>
                )}
              </div>
            </form>
          </details>
          <details>
            <summary className="btn">Ask for more</summary>
            <form action={askMore} className="panel">
              {hidden}
              <fieldset>
                <legend>Shots to retake or add</legend>
                {SHOT_SUGGESTIONS.map((s) => (
                  <label key={s}>
                    <input type="checkbox" name="shots" value={s} /> {s}
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
          <form action={decline}>
            {hidden}
            <button className="btn ghost">Decline</button>
          </form>
        </div>
      )}

      {mine && STEPS.includes(job.status as (typeof STEPS)[number]) && (
        <div className="active">
          <ol className="stepper">
            {STEPS.map((s, i) => (
              <li key={s} className={i <= STEPS.indexOf(job.status as (typeof STEPS)[number]) ? "on" : ""}>
                {STATUS_LABELS[s]}
              </li>
            ))}
          </ol>
          {job.slot && (
            <p>
              {job.virtualCall ? "Virtual call" : "Visit"}: <strong>{when(job.slot)}</strong>
              {!job.virtualCall && <> · {job.address}</>}
              {" · "}
              <a href={googleCalendarUrl(job, job.slot, pro.profile.businessName ?? pro.user.name)} target="_blank" rel="noreferrer">
                Add to Google Calendar
              </a>
            </p>
          )}
          <Customer job={job} />
          {NEXT[job.status] && (
            <form action={advance}>
              {hidden}
              <input type="hidden" name="to" value={NEXT[job.status].to} />
              <button className="btn primary">{NEXT[job.status].label}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Customer({ job }: { job: ProJob }) {
  const c = customerOf(job);
  if (!c) return null;
  return (
    <p className="muted">
      Homeowner: {c.name}
      {c.phone && <> · {c.phone}</>}
    </p>
  );
}

function RateCard({ pro, saved }: { pro: Pro; saved: boolean }) {
  const c = pro.card;
  return (
    <form action={saveRates} className="card narrow-card">
      <input type="hidden" name="provider" value={pro.user.id} />
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
              Severity {s}
              <input type="number" name={`m${s}`} min={0} step="any" defaultValue={c.severity_multiplier[s - 1] ?? 1} required />
            </label>
          ))}
        </div>
      </fieldset>
      {saved && <p className="ok">Saved. New prices apply now.</p>}
      <button className="btn primary">Save rate card</button>
    </form>
  );
}
