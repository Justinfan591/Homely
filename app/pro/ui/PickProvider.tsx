import Link from "next/link";
import { db, schema } from "@/db";
import { tradeArt } from "../art";
import { proHref } from "../href";

/** No ?provider= yet: pick who to run the dashboard as. */
export function PickProvider() {
  const providers = db.select().from(schema.providers).all();
  return (
    <div className="pick">
      <h1>Homely Pro</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        Pick the provider to run the dashboard as. The link keeps it (<code>?provider=&lt;id&gt;</code>).
      </p>
      {providers.length === 0 && (
        <p className="card" style={{ marginTop: 24 }}>
          No providers yet. Run <code>npm run db:seed</code>.
        </p>
      )}
      <div className="pick-grid">
        {providers.map((x) => (
          <Link key={x.id} href={proHref(x.id)} className="card pcard">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="avatar">{x.name.trim()[0]?.toUpperCase()}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>{x.name}</div>
                <div className="muted small">
                  ★ {x.rating.toFixed(1)} ({x.ratingCount}) · id {x.id}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {x.trades.map((t) => (
                // eslint-disable-next-line @next/next/no-img-element -- small static icons
                <img key={t} src={tradeArt(t)} alt="" width={40} height={40} style={{ objectFit: "contain" }} />
              ))}
              <span className="muted small" style={{ marginLeft: 6 }}>
                {x.trades.join(", ")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
