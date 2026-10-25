import Link from "next/link";
import type { Provider } from "@/db/schema";
import type { ProfileStatus } from "@/shared/scope";
import { tradeArt } from "../art";
import { proHref } from "../href";
import { Icon } from "./Icons";

export type View = "requests" | "calendar" | "bookings" | "reviews" | "analytics" | "schedule" | "pricing" | "profile";

type NavItem = { id: View; label: string; icon: string; phone?: boolean };

/** The design's sidebar: Bookings (plus Requests, which needs the pro) and Setup (plus Profile, which matching reads). */
export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Bookings",
    items: [
      { id: "requests", label: "Requests", icon: "inbox", phone: true },
      { id: "calendar", label: "Calendar", icon: "calendar", phone: true },
      { id: "bookings", label: "Bookings", icon: "list", phone: true },
      { id: "reviews", label: "Reviews", icon: "star" },
      { id: "analytics", label: "Analytics", icon: "chart" },
    ],
  },
  {
    section: "Setup",
    items: [
      { id: "schedule", label: "Schedule", icon: "clock" },
      { id: "pricing", label: "Pricing", icon: "tag", phone: true },
      { id: "profile", label: "Profile", icon: "user", phone: true },
    ],
  },
];
export const ALL_VIEWS = NAV.flatMap((g) => g.items);

/** Sidebar on wide screens; a top bar and the app's bottom icon bar (the five most-used pages) on phones. */
export function Shell({
  p,
  view,
  requests,
  profile,
  pricingLive,
  children,
}: {
  p: Provider;
  view: View;
  /** Requests waiting on this pro. */
  requests: number;
  profile: ProfileStatus;
  pricingLive: boolean;
  children: React.ReactNode;
}) {
  const todo = (id: View) => (id === "profile" && profile !== "complete") || (id === "pricing" && !pricingLive);
  const count = (id: View) => (id === "requests" ? requests : 0);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          Homely <span>Pro</span>
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
        {NAV.map((g) => (
          <nav key={g.section} className="nav" aria-label={g.section}>
            <div className="nav-section">{g.section}</div>
            {g.items.map((n) => (
              <Link key={n.id} href={proHref(p.id, { tab: n.id })} className={view === n.id ? "on" : ""} aria-current={view === n.id ? "page" : undefined}>
                <Icon name={n.icon} />
                {n.label}
                {todo(n.id) ? <span className="count todo">Set up</span> : count(n.id) ? <span className="count">{count(n.id)}</span> : null}
              </Link>
            ))}
          </nav>
        ))}
        <div className="side-foot">
          <span className="live">Live</span>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          Homely <span>Pro</span>
        </div>
        <span className="muted small">{p.name}</span>
      </header>

      <main className="main">{children}</main>

      <nav className="tabbar" aria-label="Sections">
        {ALL_VIEWS.filter((n) => n.phone).map((n) => {
          const b = todo(n.id) ? "!" : count(n.id) || null;
          return (
            <Link key={n.id} href={proHref(p.id, { tab: n.id })} className={view === n.id ? "on" : ""} aria-label={n.label}>
              <Icon name={n.icon} size={26} />
              {n.label}
              {b ? <span className="dot">{b}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
