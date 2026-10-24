import Link from "next/link";
import type { Provider } from "@/db/schema";
import type { ProfileStatus, ProTab } from "@/shared/scope";
import { tradeArt } from "../art";
import { proHref } from "../href";
import { CalendarStatus } from "./Calendar";
import { Icon } from "./Icons";

export type View = ProTab | "profile";

export const NAV: { id: View; label: string; short: string; icon: string }[] = [
  { id: "new", label: "Requests", short: "Requests", icon: "inbox" },
  { id: "review", label: "Needs review", short: "Review", icon: "eye" },
  { id: "active", label: "Schedule", short: "Schedule", icon: "calendar" },
  { id: "done", label: "Done", short: "Done", icon: "check" },
  { id: "profile", label: "Profile", short: "Profile", icon: "user" },
];

/** Sidebar on wide screens; a top bar and the app's bottom icon bar on phones. */
export function Shell({
  p,
  view,
  counts,
  profile,
  children,
}: {
  p: Provider;
  view: View;
  counts: Record<ProTab, number>;
  profile: ProfileStatus;
  children: React.ReactNode;
}) {
  const badge = (id: View) => (id === "profile" ? (profile === "complete" ? null : "!") : counts[id] || null);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          Scope <span>Pro</span>
        </div>
        <div className="me">
          <div className="me-top">
            <span className="avatar">{p.name.trim()[0]?.toUpperCase()}</span>
            <div>
              <div className="me-name">{p.name}</div>
              <div className="muted small">
                ★ {p.rating.toFixed(1)} ({p.ratingCount}) · {p.radiusKm} km
              </div>
            </div>
          </div>
          <div className="me-arts">
            {p.trades.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element -- small static icons
              <img key={t} src={tradeArt(t)} alt={t} title={t} />
            ))}
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.id} href={proHref(p.id, { tab: n.id })} className={view === n.id ? "on" : ""}>
              <Icon name={n.icon} />
              {n.label}
              {n.id === "profile" ? (
                profile !== "complete" && <span className="count todo">Finish setup</span>
              ) : (
                <span className="count">{counts[n.id]}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <CalendarStatus p={p} />
          <span className="live">Live</span>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          Scope <span>Pro</span>
        </div>
        <span className="muted small">{p.name}</span>
      </header>

      <main className="main">{children}</main>

      <nav className="tabbar" aria-label="Sections">
        {NAV.map((n) => {
          const b = badge(n.id);
          return (
            <Link key={n.id} href={proHref(p.id, { tab: n.id })} className={view === n.id ? "on" : ""} aria-label={n.label}>
              <Icon name={n.icon} size={26} />
              {n.short}
              {b ? <span className="dot">{b}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
