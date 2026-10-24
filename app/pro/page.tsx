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
import { accept, advance, askMore, decline, disconnectGoogle, offer, virtualCall, withdraw } from "./actions";
import { answerProfile, retryProfile, saveProfile, saveProfilePricing, saveProviderWebsite, skipProfileQuestion, startProfile } from "./actions";
import { DESCRIPTION_MAX, PRICE_ADJUST_MAX, PROFILE_MAX_QUESTIONS, pricingFromRateCard, profileStatus, quote, type ProfileStatus, type ProfileTurn } from "@/shared/scope";
import { AutoRefresh } from "./AutoRefresh";
import { SubmitButton } from "./SubmitButton";
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
  const tab = q.tab === "profile" || (q.tab && q.tab in tabs) ? (q.tab as ProTab | "profile") : "new";
  const status = profileStatus(p);
  const selected = q.job ? detail(p, q.job) : null;

  return (
    <div className="pro">
      {/* No polling while answering profile questions. */}
      {tab !== "profile" && <AutoRefresh />}
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
        <Link href={proHref(p.id, { tab: "profile" })} className={tab === "profile" ? "on" : ""}>
          Profile {status !== "complete" && <span className="count todo">Finish setup</span>}
        </Link>
      </nav>

      {status !== "complete" && tab !== "profile" && <ProfileNudge providerId={p.id} status={status} />}

      {q.error && <p className="error">{q.error}</p>}
      {q.notice && <p className="notice">{q.notice}</p>}

      {tab === "profile" ? (
        <Profile p={p} />
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
        {c.status === "open" && <span className="badge badge-open">Open for offers · {c.invitedCount} pros</span>}
        {c.status === "open" && <OfferBadge offer={c.myOffer} />}
        {c.status === "more_info" && <span className="badge wait">Waiting for homeowner</span>}
        {c.status === "handoff" && <span className="badge handoff">Handoff</span>}
        {c.status === "virtual_call" && <span className="badge">Virtual call</span>}
        {tab === "active" && <span className="badge">{JOB_STATUS_LABELS[c.status]}</span>}
      </div>
    </Link>
  );
}

/** This pro's offer on an open request, as a short badge. */
function OfferBadge({ offer: o }: { offer: ProQueueCard["myOffer"] }) {
  if (!o || o.status === "withdrawn") return <span className="badge">No offer yet</span>;
  if (o.status === "stale") return <span className="badge wait">Spec updated · re-send offer</span>;
  return (
    <span className="badge badge-offer">
      Your offer: {usd(o.price)} · {slotLabel(o.slot)}
    </span>
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
  const takeable = ["pending", "handoff", "virtual_call"].includes(status);
  const myOffer = d.myOffer && ["active", "stale"].includes(d.myOffer.status) ? d.myOffer : null;
  const offerSlot = myOffer && d.slots.some((s) => s.startsAt === myOffer.slot) ? myOffer.slot : d.slots[0]?.startsAt;
  // One tap: the suggested price at the first slot (the homeowner's pick when they made one).
  const quick = (label: string, action: typeof offer) =>
    d.slots[0] && (
      <form action={action} className="quick">
        {hidden}
        <input type="hidden" name="slot" value={d.slots[0].startsAt} />
        <input type="hidden" name="price" value={quote.price} />
        <button className="btn primary">
          {label} · {usd(quote.price)} · {slotLabel(d.slots[0].startsAt)}
        </button>
      </form>
    );
  const askedByMe = !job.request?.providerId || job.request.providerId === p.id;
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
      {d.fitReason && <p className="fit">Why you: {d.fitReason}</p>}

      <div className="price">
        <div>
          <span className="muted">Suggested price</span>
          <strong>{usd(quote.price)}</strong>
          <span className="muted small">{priceRange(quote.low, quote.high)}</span>
        </div>
        {job.price != null && (
          <div>
            <span className="muted">Confirmed</span>
            <strong>{usd(job.price)}</strong>
          </div>
        )}
        {d.priceReason && <p className="fit">{d.priceReason}</p>}
        <span className="muted small">
          {ESTIMATE_LABEL}. {d.priceReason ? "Your profile prices, adjusted for this job." : "From your profile prices."}
        </span>
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
          <h4>{askedByMe ? "You asked for more" : "Another pro asked for more"}</h4>
          <p>
            {[...job.request.shotIds.map(shotPrompt), ...job.request.questionIds.map((id) => template.questions.find((x) => x.id === id)?.q ?? id), job.request.message]
              .filter(Boolean)
              .join("; ")}
          </p>
          <p className="muted">Waiting for the homeowner. It comes back here with an updated spec when they reply.</p>
        </div>
      )}

      {status === "open" && (
        <div className="actions">
          <p className="muted small" style={{ flexBasis: "100%" }}>
            Sent to {d.invitedCount} pros at once. Send your price and time; the homeowner picks one offer.
          </p>
          {myOffer?.status !== "active" && quick(myOffer ? "Re-send offer" : "Send offer", offer)}
          <details>
            <summary className={myOffer?.status === "active" ? "btn primary" : "btn"}>{myOffer?.status === "active" ? "Update offer" : "Change price or time"}</summary>
            <form action={offer} className="panel">
              {hidden}
              {myOffer?.status === "stale" && <p className="muted">The homeowner updated the scan, so your earlier offer was paused. Check the new spec and re-send.</p>}
              <fieldset>
                <legend>Time slot</legend>
                {d.slots.map((s) => (
                  <label key={s.startsAt}>
                    <input type="radio" name="slot" value={s.startsAt} defaultChecked={s.startsAt === offerSlot} /> {slotLabel(s.startsAt)}
                    {s.id === "requested" && <span className="badge">Homeowner&apos;s pick</span>}
                  </label>
                ))}
              </fieldset>
              <label>
                Your price (USD)
                <input type="number" name="price" min={1} step="1" defaultValue={myOffer?.price ?? quote.price} required />
              </label>
              <p className="muted small">Suggested {usd(quote.price)}. You can set any price.</p>
              <button className="btn primary">{myOffer ? "Update offer" : "Send offer"}</button>
            </form>
          </details>
          {myOffer?.status === "active" && (
            <form action={withdraw}>
              {hidden}
              <button className="btn">Withdraw offer</button>
            </form>
          )}
          <AskMore hidden={hidden} template={template} />
          <form action={decline}>
            {hidden}
            <button className="btn ghost">Pass</button>
          </form>
        </div>
      )}

      {takeable && (
        <div className="actions">
          {quick(status === "virtual_call" ? "Accept the call" : "Accept", accept)}
          <details>
            <summary className="btn">Change price or time</summary>
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
                Price (USD)
                <input type="number" name="price" min={1} step="1" defaultValue={quote.price} required />
              </label>
              <p className="muted small">Suggested {usd(quote.price)}. You can set any price.</p>
              <button className="btn primary">Confirm booking</button>
            </form>
          </details>
          <AskMore hidden={hidden} template={template} />
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

function AskMore({ hidden, template }: { hidden: React.ReactNode; template: ProJobDetail["template"] }) {
  return (
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

/** Shown on every view until the profile interview is done. */
function ProfileNudge({ providerId, status }: { providerId: number; status: ProfileStatus }) {
  const text =
    status === "in_progress"
      ? "You're partway through your profile. Finish the questions so we can send you jobs that fit."
      : status === "summary_only"
        ? "Matches use only your short summary right now. Answer a few quick questions so we can send you jobs that fit you."
        : "Finish your profile to get jobs that fit you. A few quick questions, about 2 minutes.";
  return (
    <div className="nudge">
      <span>{text}</span>
      <Link className="btn primary small-btn" href={proHref(providerId, { tab: "profile" })}>
        {status === "in_progress" ? "Continue" : "Finish profile"}
      </Link>
    </div>
  );
}

/** Profile tab: the agent interview, then pricing, then the finished profile (editable). */
function Profile({ p }: { p: Provider }) {
  const profile = p.profile;
  const hidden = <input type="hidden" name="provider" value={p.id} />;

  if (!profile) {
    return (
      <div className="card narrow-card">
        <h2>Set up your profile</h2>
        <p className="muted">
          Our matching agent sends each new request to the pros who fit it best. Right now it only has
          {p.description ? " your short summary" : " your trade and distance"} to go on. Answer a few quick questions (tap to answer, about 2
          minutes) so it knows which jobs are right for you, then set your prices.
        </p>
        {p.description && (
          <p className="small">
            <span className="muted">Current summary:</span> {p.description}
          </p>
        )}
        <form action={startProfile}>
          {hidden}
          <label>
            Your website (optional)
            <input type="text" inputMode="url" name="website" maxLength={500} defaultValue={p.website ?? ""} placeholder="yourcompany.com" />
          </label>
          <p className="muted small">We read your website so the questions skip what it already says. Takes up to a minute.</p>
          <SubmitButton pending="Reading your website and preparing your first question…">Start</SubmitButton>
        </form>
      </div>
    );
  }

  if (profile.stage === "interview") {
    const q = profile.pending;
    return (
      <div className="card narrow-card">
        <div className="qtop">
          <h2>Profile questions</h2>
          <span className="muted">
            Question {profile.turns.length + 1} of up to {PROFILE_MAX_QUESTIONS}
          </span>
        </div>
        <progress className="pbar" value={profile.turns.length} max={PROFILE_MAX_QUESTIONS} />
        {q ? (
          <>
            <form action={answerProfile} className="pq">
              {hidden}
              <h3>{q.q}</h3>
              <p className="muted small">{q.multi ? "Pick all that apply." : "Pick one."}</p>
              <div className="chips">
                {q.options.map((o) => (
                  <label key={o} className="chip">
                    <input type={q.multi ? "checkbox" : "radio"} name="answer" value={o} />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
              <label>
                Add detail (optional)
                <input type="text" name="note" maxLength={500} placeholder="Anything the options miss" />
              </label>
              <SubmitButton pending="Thinking…">Next</SubmitButton>
            </form>
            <form action={skipProfileQuestion}>
              {hidden}
              <SubmitButton className="btn ghost" pending="Thinking…">
                Skip this question
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={retryProfile}>
            {hidden}
            <p className="muted">Your answers are saved. The assistant didn&apos;t send the next question.</p>
            <SubmitButton pending="Thinking…">Try again</SubmitButton>
          </form>
        )}
        <Answers turns={profile.turns} />
      </div>
    );
  }

  const pricing = pricingFromRateCard(p.rateCard);
  const example = quote(p.rateCard, { severity: 3, areaM2: 2 });
  const pricingForm = (finishing: boolean) => (
    <form action={saveProfilePricing}>
      {hidden}
      <input type="hidden" name="finishing" value={finishing ? "1" : "0"} />
      <div className="grid3">
        <label>
          Call-out fee ($)
          <input type="number" name="callOut" min={0} step="any" defaultValue={pricing.callOut} required />
        </label>
        <label>
          Price per m² ($)
          <input type="number" name="perM2" min={0} step="any" defaultValue={pricing.perM2} required />
        </label>
        <label>
          Extra for the most severe jobs (%)
          <input type="number" name="severePct" min={0} max={1000} step="1" defaultValue={pricing.severePct} required />
        </label>
      </div>
      <p className="muted small">
        Suggested price = call-out + price per m² × area, rising to +{pricing.severePct}% for the most severe jobs, shown as a ±15% range. With
        these numbers a 2 m² moderate job comes out at {priceRange(example.low, example.high)}. Scope then adjusts each job by up to ±{PRICE_ADJUST_MAX}% (access, urgency, what you include) and shows you why. You can still set any price on each offer.
      </p>
      <button className="btn primary">{finishing ? "Finish profile" : "Save prices"}</button>
    </form>
  );

  if (profile.stage === "pricing") {
    return (
      <div className="card narrow-card">
        <h2>Last step: your prices</h2>
        <p className="muted">Your prices are the starting point for every suggestion. Scope adjusts each one for the job and tells you why.</p>
        {pricingForm(true)}
        {profile.draftDescription && (
          <p className="small">
            <span className="muted">Your profile summary:</span> {profile.draftDescription}
          </p>
        )}
      </div>
    );
  }

  const f = profile.facts;
  return (
    <div className="stack narrow-card">
      <div className="card">
        <h2>Your profile</h2>
        <p className="ok">Complete. New requests are matched with it.</p>
        {f && (
          <dl>
            <div>
              <dt>Specialties</dt>
              <dd>{f.specialties.join(", ")}</dd>
            </div>
            <div>
              <dt>Job sizes</dt>
              <dd>{f.jobSizes}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{f.availability}</dd>
            </div>
            {f.notes && (
              <div>
                <dt>Other</dt>
                <dd>{f.notes}</dd>
              </div>
            )}
          </dl>
        )}
        <form action={saveProfile}>
          {hidden}
          <label>
            Summary the matching agent reads
            <textarea name="description" rows={5} maxLength={DESCRIPTION_MAX} defaultValue={p.description ?? ""} />
          </label>
          <button className="btn">Save summary</button>
        </form>
        <form action={saveProviderWebsite}>
          {hidden}
          <label>
            Website
            <input type="text" inputMode="url" name="website" maxLength={500} defaultValue={p.website ?? ""} placeholder="yourcompany.com" />
          </label>
          <SubmitButton className="btn" pending="Reading your website…">
            Save website
          </SubmitButton>
        </form>
        <form action={startProfile}>
          {hidden}
          <SubmitButton className="btn ghost" pending="Preparing your first question…">
            Redo the questions
          </SubmitButton>
        </form>
        <Answers turns={profile.turns} />
      </div>
      <div className="card">
        <h2>Prices</h2>
        {pricingForm(false)}
      </div>
    </div>
  );
}

function Answers({ turns }: { turns: ProfileTurn[] }) {
  if (!turns.length) return null;
  return (
    <details className="answers">
      <summary className="muted small">Your answers ({turns.length})</summary>
      <dl>
        {turns.map((t) => (
          <div key={t.id}>
            <dt>{t.q}</dt>
            <dd>{t.answer.length || t.note ? [t.answer.join(", "), t.note].filter(Boolean).join(" · ") : <span className="muted">Skipped</span>}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

