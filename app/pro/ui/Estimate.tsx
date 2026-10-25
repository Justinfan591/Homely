import { cad, type JobSpecInfo, type Quote } from "@/shared/scope";

const COMPLEXITY = { low: "Low", medium: "Medium", high: "High" } as const;
const hoursLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;

/** The design's "Agent's estimate": hours and complexity from the spec, priced with this pro's rates. */
export function Estimate({ quote, spec, title = "Agent's estimate" }: { quote: Quote; spec: Pick<JobSpecInfo, "complexity">; title?: string }) {
  return (
    <div className="estimate">
      <div className="muted small">
        {title} · {hoursLabel(quote.hours)}
        {spec.complexity ? ` · ${COMPLEXITY[spec.complexity]} complexity` : ""}
      </div>
      <dl className="rows">
        <div>
          <dt>Call-out (1st hour)</dt>
          <dd>{cad(quote.callOut)}</dd>
        </div>
        <div>
          <dt>Extra time</dt>
          <dd>{quote.extra ? cad(quote.extra) : "–"}</dd>
        </div>
        <div>
          <dt>Parts</dt>
          <dd>{quote.parts ? cad(quote.parts) : "–"}</dd>
        </div>
        <div className="total">
          <dt>Total</dt>
          <dd>{cad(quote.price)}</dd>
        </div>
      </dl>
    </div>
  );
}
