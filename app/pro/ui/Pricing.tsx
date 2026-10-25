import type { Provider } from "@/db/schema";
import { cad, toRateCard, type ProviderPricing } from "@/shared/scope";
import { approvePricingDraft, sendPricing } from "../actions";
import { SubmitButton } from "../SubmitButton";

/** Pricing: chat with the pricing agent on the left, the drafted rates and what it asks homeowners on the right. */
export function Pricing({ p, state }: { p: Provider; state: ProviderPricing }) {
  const d = state.draft;
  const live = state.status === "live";
  const current = toRateCard(p.rateCard);
  const hidden = <input type="hidden" name="provider" value={p.id} />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pricing</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Set your rates. The agent estimates time and complexity for each job and quotes from them.
          </p>
        </div>
      </div>
      <div className="pricing">
        <section aria-label="Chat" className="card chat">
          <div className="msgs">
            {state.messages.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
          <form action={sendPricing} className="reply">
            {hidden}
            <input type="text" name="message" aria-label="Message" placeholder="Reply" autoComplete="off" required maxLength={1000} />
            <SubmitButton className="btn primary send" pending="…" aria-label="Send">
              ↑
            </SubmitButton>
          </form>
        </section>

        <section aria-label="Draft" className="card draft">
          <div className="muted small">Rates · {live ? "Live" : "Draft"}</div>
          <dl className="rows">
            <div>
              <dt>Call-out (1st hour)</dt>
              <dd>{cad(d.callOut)}</dd>
            </div>
            <div>
              <dt>Each hour after</dt>
              <dd>{cad(d.hourly)}</dd>
            </div>
            <div>
              <dt>Parts</dt>
              <dd>Cost + {d.partsMarkupPct}%</dd>
            </div>
            <div>
              <dt>Over {cad(d.approveOver)}</dt>
              <dd>Sent to you</dd>
            </div>
          </dl>
          <div className="muted small" style={{ marginTop: 20 }}>
            Agent asks
          </div>
          <div className="asks">
            {state.asks.length ? state.asks.map((a) => <div key={a}>{a}</div>) : <div className="muted">Tell the agent what you need to know about a job.</div>}
          </div>
          <form action={approvePricingDraft}>
            {hidden}
            <SubmitButton className={live ? "btn big" : "btn primary big"} pending="Saving…" disabled={live}>
              {live ? "Approved" : "Approve"}
            </SubmitButton>
          </form>
          {!live && state.approvedAt && (
            <p className="muted small">
              Until you approve, jobs are quoted with your last approved rates ({cad(current.callOut)} call-out, {cad(current.hourly)}/h).
            </p>
          )}
          {!state.approvedAt && <p className="muted small">Until you approve, the agent doesn&apos;t send offers for you. You can still send them yourself.</p>}
        </section>
      </div>
    </>
  );
}
