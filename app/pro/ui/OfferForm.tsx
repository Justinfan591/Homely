import type { Provider } from "@/db/schema";
import { slotLabel, usd, type ProJobDetail, type ProTab } from "@/shared/scope";
import { accept, askMore, decline, offer, virtualCall, withdraw } from "../actions";

/**
 * What this pro can do with the open job, in one card: pick a time, set a price, send.
 * Open requests send an offer; pending, handoff and virtual-call jobs are accepted directly.
 * This is the only form on the page with price and slot inputs (scripts/e2e.ts reads the first of each).
 */
export function Actions({ d, p, tab }: { d: ProJobDetail; p: Provider; tab: ProTab }) {
  const { job, quote, template } = d;
  const status = job.status;
  const open = status === "open";
  const takeable = ["pending", "handoff", "virtual_call"].includes(status);
  if (!open && !takeable) return null;

  const hidden = (
    <>
      <input type="hidden" name="provider" value={p.id} />
      <input type="hidden" name="job" value={job.id} />
      <input type="hidden" name="tab" value={tab} />
    </>
  );
  const myOffer = d.myOffer && ["active", "stale"].includes(d.myOffer.status) ? d.myOffer : null;
  const live = myOffer?.status === "active";
  const pickedSlot = myOffer && d.slots.some((s) => s.startsAt === myOffer.slot) ? myOffer.slot : d.slots[0]?.startsAt;
  const label = open ? (live ? "Update offer" : myOffer ? "Re-send offer" : "Send offer") : status === "virtual_call" ? "Accept the call" : "Accept";

  return (
    <div className="card act">
      <div>
        <h3>{open ? (live ? "Your offer" : "Send your quote") : status === "virtual_call" ? "Take the virtual call" : "Take this job"}</h3>
        <p className="muted small" style={{ marginTop: 4 }}>
          {open
            ? `Sent to ${d.invitedCount} pros at once. Send your price and time; the homeowner picks one offer.`
            : "Pick a time and confirm the price. The homeowner sees it right away."}
        </p>
      </div>
      {myOffer?.status === "stale" && <p className="banner nudge" style={{ margin: 0 }}>The homeowner updated the scan, so your earlier offer was paused. Check the new spec and re-send.</p>}

      <form action={open ? offer : accept} className="act">
        {hidden}
        <fieldset className="slots">
          <legend>Time</legend>
          {d.slots.map((s) => (
            <label key={s.startsAt} className="slot">
              <input type="radio" name="slot" value={s.startsAt} defaultChecked={s.startsAt === pickedSlot} />
              <span>
                {slotLabel(s.startsAt)}
                {s.id === "requested" && <small>Homeowner&apos;s pick</small>}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          Your price (USD)
          <span className="priceinput">
            <b>$</b>
            <input type="number" name="price" min={1} step="1" defaultValue={myOffer?.price ?? quote.price} required aria-label="Price in US dollars" />
          </span>
        </label>
        <p className="muted small">Suggested {usd(quote.price)}. You can set any price.</p>
        <button className="btn primary big">{label}</button>
      </form>

      <div className="act-row">
        {live && (
          <form action={withdraw}>
            {hidden}
            <button className="btn">Withdraw offer</button>
          </form>
        )}
        <details className="drawer">
          <summary className="btn">Ask for more</summary>
          <form action={askMore} className="panel">
            {hidden}
            <fieldset className="chips">
              <legend>Photos to retake or add</legend>
              {template.required_shots.map((s) => (
                <label key={s.id} className="chip">
                  <input type="checkbox" name="shots" value={s.id} />
                  <span>{s.prompt}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="chips">
              <legend>Questions to ask again</legend>
              {template.questions.map((x) => (
                <label key={x.id} className="chip">
                  <input type="checkbox" name="questions" value={x.id} />
                  <span>{x.q}</span>
                </label>
              ))}
            </fieldset>
            <label className="field">
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
            <button className="btn ghost danger">{open ? "Pass" : "Decline"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
