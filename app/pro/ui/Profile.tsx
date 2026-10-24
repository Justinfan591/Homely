import Link from "next/link";
import type { Provider } from "@/db/schema";
import { DESCRIPTION_MAX, PRICE_ADJUST_MAX, PROFILE_MAX_QUESTIONS, priceRange, pricingFromRateCard, quote, type ProfileStatus, type ProfileTurn } from "@/shared/scope";
import { answerProfile, retryProfile, saveProfile, saveProfilePricing, saveProviderWebsite, skipProfileQuestion, startProfile } from "../actions";
import { proHref } from "../href";
import { SubmitButton } from "../SubmitButton";

/** Shown on every view until the profile interview is done. */
export function ProfileNudge({ providerId, status }: { providerId: number; status: ProfileStatus }) {
  const text =
    status === "in_progress"
      ? "You're partway through your profile. Finish the questions so we can send you jobs that fit."
      : status === "summary_only"
        ? "Matches use only your short summary right now. Answer a few quick questions so we can send you jobs that fit you."
        : "Finish your profile to get jobs that fit you. A few quick questions, about 2 minutes.";
  return (
    <div className="banner nudge">
      <span>{text}</span>
      <Link className="btn primary small-btn" href={proHref(providerId, { tab: "profile" })}>
        {status === "in_progress" ? "Continue" : "Finish profile"}
      </Link>
    </div>
  );
}

/** Profile tab: the agent interview (one question at a time, like the app), then pricing, then the finished profile. */
export function Profile({ p }: { p: Provider }) {
  const profile = p.profile;
  const hidden = <input type="hidden" name="provider" value={p.id} />;

  if (!profile) {
    return (
      <div className="stack narrow">
        <div className="page-head">
          <h1>Set up your profile</h1>
        </div>
        <div className="card stack">
          <p>
            Our matching agent sends each new request to the pros who fit it best. Right now it only has
            {p.description ? " your short summary" : " your trade and distance"} to go on. Answer a few quick questions (tap to answer, about 2
            minutes) so it knows which jobs are right for you, then set your prices.
          </p>
          {p.description && (
            <p className="small">
              <span className="muted">Current summary:</span> {p.description}
            </p>
          )}
          <form action={startProfile} className="stack">
            {hidden}
            <label className="field">
              Your website (optional)
              <input type="text" inputMode="url" name="website" maxLength={500} defaultValue={p.website ?? ""} placeholder="yourcompany.com" />
            </label>
            <p className="muted small">We read your website so the questions skip what it already says. Takes up to a minute.</p>
            <SubmitButton className="btn primary big" pending="Reading your website and preparing your first question…">
              Start
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  if (profile.stage === "interview") {
    const q = profile.pending;
    const n = profile.turns.length;
    return (
      <div className="stack narrow">
        <div className="page-head">
          <h1>Profile questions</h1>
          <span className="muted">
            {n + 1} of up to {PROFILE_MAX_QUESTIONS}
          </span>
        </div>
        <div className="pbar" role="progressbar" aria-valuenow={n} aria-valuemax={PROFILE_MAX_QUESTIONS}>
          <i style={{ width: `${Math.min(100, (n / PROFILE_MAX_QUESTIONS) * 100)}%` }} />
        </div>
        {q ? (
          <>
            <form action={answerProfile} className="stack">
              {hidden}
              <div>
                <h2 className="qtitle">{q.q}</h2>
                <p className="muted small" style={{ marginTop: 6 }}>
                  {q.multi ? "Pick all that apply." : "Pick one."}
                </p>
              </div>
              <div className="choices">
                {q.options.map((o) => (
                  <label key={o} className="choice">
                    <input type={q.multi ? "checkbox" : "radio"} name="answer" value={o} />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
              <label className="field">
                Add detail (optional)
                <input type="text" name="note" maxLength={500} placeholder="Anything the options miss" />
              </label>
              <SubmitButton className="btn primary big" pending="Thinking…">
                Next
              </SubmitButton>
            </form>
            <form action={skipProfileQuestion} style={{ alignSelf: "center" }}>
              {hidden}
              <SubmitButton className="btn ghost" pending="Thinking…">
                Skip this question
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={retryProfile} className="card stack">
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
    <form action={saveProfilePricing} className="stack">
      {hidden}
      <input type="hidden" name="finishing" value={finishing ? "1" : "0"} />
      <div className="grid3">
        <label className="field">
          Call-out fee ($)
          <input type="number" name="callOut" min={0} step="any" defaultValue={pricing.callOut} required />
        </label>
        <label className="field">
          Price per m² ($)
          <input type="number" name="perM2" min={0} step="any" defaultValue={pricing.perM2} required />
        </label>
        <label className="field">
          Extra for the most severe jobs (%)
          <input type="number" name="severePct" min={0} max={1000} step="1" defaultValue={pricing.severePct} required />
        </label>
      </div>
      <p className="muted small">
        Suggested price = call-out + price per m² × area, rising to +{pricing.severePct}% for the most severe jobs, shown as a ±15% range. With
        these numbers a 2 m² moderate job comes out at {priceRange(example.low, example.high)}. Scope then adjusts each job by up to ±{PRICE_ADJUST_MAX}% (access,
        urgency, what you include) and shows you why. You can still set any price on each offer.
      </p>
      <button className={finishing ? "btn primary big" : "btn primary"}>{finishing ? "Finish profile" : "Save prices"}</button>
    </form>
  );

  if (profile.stage === "pricing") {
    return (
      <div className="stack narrow">
        <div className="page-head">
          <h1>Last step: your prices</h1>
        </div>
        <div className="card stack">
          <p className="muted">Your prices are the starting point for every suggestion. Scope adjusts each one for the job and tells you why.</p>
          {pricingForm(true)}
          {profile.draftDescription && (
            <p className="small">
              <span className="muted">Your profile summary:</span> {profile.draftDescription}
            </p>
          )}
        </div>
      </div>
    );
  }

  const f = profile.facts;
  return (
    <div className="stack narrow">
      <div className="page-head">
        <h1>Your profile</h1>
        <span className="ok">Complete</span>
      </div>
      <div className="card stack">
        <p className="muted">New requests are matched with this.</p>
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
        <form action={saveProfile} className="stack">
          {hidden}
          <label className="field">
            Summary the matching agent reads
            <textarea name="description" rows={5} maxLength={DESCRIPTION_MAX} defaultValue={p.description ?? ""} />
          </label>
          <button className="btn" style={{ alignSelf: "flex-start" }}>
            Save summary
          </button>
        </form>
        <form action={saveProviderWebsite} className="stack">
          {hidden}
          <label className="field">
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
      <div className="card stack">
        <h2 style={{ fontSize: 22, letterSpacing: "-0.03em" }}>Prices</h2>
        {pricingForm(false)}
      </div>
    </div>
  );
}

function Answers({ turns }: { turns: ProfileTurn[] }) {
  if (!turns.length) return null;
  return (
    <details>
      <summary className="muted small">Your answers ({turns.length})</summary>
      <dl style={{ marginTop: 8 }}>
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
