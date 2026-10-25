import type { Provider } from "@/db/schema";
import type { ProReview } from "@/lib/scope/pro-pages";
import { Empty } from "./JobCard";

function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
            fill={i <= value ? "currentColor" : "none"}
            stroke={i <= value ? "currentColor" : "#C9C3B8"}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

/** Reviews: what homeowners said after each finished job. */
export function Reviews({ p, list }: { p: Provider; list: ProReview[] }) {
  return (
    <>
      <div className="page-head">
        <h1>Reviews</h1>
        <span className="muted">{p.ratingCount ? `${p.rating.toFixed(1)} · ${p.ratingCount} ${p.ratingCount === 1 ? "review" : "reviews"}` : "No reviews yet"}</span>
      </div>
      {list.length ? (
        <div className="reviews">
          {list.map((r) => (
            <article key={r.jobId} className="card review">
              <div className="row-top">
                <strong>{r.name}</strong>
                <Stars value={r.stars} />
              </div>
              <div className="muted small">
                {r.service} · {r.date.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
              </div>
              {r.note && <p>{r.note}</p>}
              {r.tags.length > 0 && (
                <div className="tags">
                  {r.tags.map((t) => (
                    <span key={t} className="badge">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>Reviews from your finished jobs show up here.</Empty>
      )}
    </>
  );
}
