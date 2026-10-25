import type { Provider } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { pricingLive, pricingState } from "@/lib/scope/pricing-chat";
import { jobDetail, providerById, queue } from "@/lib/scope/pro";
import { analytics, bookings, calendarWeek, reviews } from "@/lib/scope/pro-pages";
import { profileView } from "@/lib/scope/profile";
import { cad, DEFAULT_HOURS, profileStatus, type ProJobDetail } from "@/shared/scope";
import { AutoRefresh } from "./AutoRefresh";
import { Analytics } from "./ui/Analytics";
import { Bookings } from "./ui/Bookings";
import { Hours } from "./ui/Hours";
import { Empty, JobCard } from "./ui/JobCard";
import { JobDetail } from "./ui/JobDetail";
import { PickProvider } from "./ui/PickProvider";
import { Pricing } from "./ui/Pricing";
import { Profile, ProfileNudge } from "./ui/Profile";
import { Reviews } from "./ui/Reviews";
import { ALL_VIEWS, Shell, type View } from "./ui/Shell";
import { WeekCalendar } from "./ui/WeekCalendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Homely Pro" };

type Search = { provider?: string; tab?: string; job?: string; error?: string; saved?: string; notice?: string; show?: string; week?: string };

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

/** Old links (?tab=new|review|active|done) still land somewhere sensible. */
const OLD_TABS: Record<string, { view: View; show?: string }> = {
  new: { view: "requests" },
  review: { view: "requests" },
  active: { view: "bookings", show: "upcoming" },
  done: { view: "bookings", show: "past" },
};

export default async function ProPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  let p = provider(q.provider);
  if (!p) return <PickProvider />;
  // Finishes a profile left at the old pricing step (prices now live in Pricing).
  if (p.profile?.stage === "pricing") {
    profileView(p);
    p = providerById(p.id);
  }

  const tabs = queue(p);
  const requests = [...tabs.new, ...tabs.review];
  const old = q.tab ? OLD_TABS[q.tab] : undefined;
  const asked = ALL_VIEWS.find((v) => v.id === q.tab)?.id ?? old?.view;
  const view: View = asked ?? (requests.length ? "requests" : "calendar");
  const status = profileStatus(p);
  const live = pricingLive(p);
  const selected = q.job ? detail(p, q.job) : null;

  return (
    <Shell p={p} view={view} requests={tabs.new.filter((c) => c.status !== "more_info").length + tabs.review.length} profile={status} pricingLive={live}>
      {/* No polling while typing in Setup. */}
      {!["profile", "pricing", "schedule"].includes(view) && <AutoRefresh />}
      {q.error && <p className="banner error">{q.error}</p>}
      {q.notice && <p className="banner notice">{q.notice}</p>}
      {status !== "complete" && !["profile", "pricing", "schedule"].includes(view) && <ProfileNudge providerId={p.id} status={status} />}

      {view === "requests" && (
        <>
          <div className="page-head">
            <h1>Requests</h1>
            {requests.length > 0 && (
              <span className="muted">
                {requests.length} {requests.length === 1 ? "job" : "jobs"}
              </span>
            )}
          </div>
          {!live && (
            <p className="banner nudge">
              Approve your rates in Pricing and the agent sends offers for you, up to your limit.
            </p>
          )}
          <div className="split">
            <section className="list">
              {requests.length === 0 && <Empty>No requests right now. They show up here automatically.</Empty>}
              {requests.map((c) => (
                <JobCard key={c.jobId} card={c} providerId={p.id} tab="requests" selected={c.jobId === selected?.job.id} />
              ))}
            </section>
            {selected ? <JobDetail d={selected} p={p} tab="requests" /> : requests.length > 0 && <Empty>Open a request to see the photos, what the homeowner said and your price.</Empty>}
          </div>
        </>
      )}

      {view === "calendar" && (() => {
        const week = Number.isInteger(Number(q.week)) ? Math.max(-52, Math.min(52, Number(q.week ?? 0))) : 0;
        const { start, items } = calendarWeek(p, week);
        return <WeekCalendar p={p} start={start} items={items} week={week} selected={selected?.job.id ?? null} />;
      })()}

      {view === "bookings" && (() => {
        const list = bookings(p);
        const show = q.show === "past" || old?.show === "past" ? "past" : "upcoming";
        const open = selected && ["accepted", "en_route", "done"].includes(selected.job.status) ? selected : list[show][0] ? detail(p, list[show][0].jobId) : null;
        return <Bookings p={p} list={list} show={show} selected={open} />;
      })()}

      {view === "reviews" && <Reviews p={p} list={reviews(p)} />}

      {view === "analytics" && <Analytics data={analytics(p, cad)} />}

      {view === "schedule" && (
        <>
          <div className="page-head">
            <div>
              <h1>Schedule</h1>
              <p className="muted" style={{ marginTop: 8 }}>
                Drag across a day to add hours. Drag over dark time to take a break.
              </p>
            </div>
          </div>
          <Hours providerId={p.id} initial={p.hours ?? DEFAULT_HOURS} />
        </>
      )}

      {view === "pricing" && <Pricing p={p} state={pricingState(p)} />}

      {view === "profile" && <Profile p={p} />}
    </Shell>
  );
}
