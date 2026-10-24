import type { Provider } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { jobDetail, providerById, queue } from "@/lib/scope/pro";
import { profileStatus, type ProJobDetail, type ProTab } from "@/shared/scope";
import { AutoRefresh } from "./AutoRefresh";
import { Empty, JobCard } from "./ui/JobCard";
import { JobDetail } from "./ui/JobDetail";
import { PickProvider } from "./ui/PickProvider";
import { Profile, ProfileNudge } from "./ui/Profile";
import { Schedule } from "./ui/Schedule";
import { NAV, Shell, type View } from "./ui/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scope Pro" };

type Search = { provider?: string; tab?: string; job?: string; error?: string; saved?: string; notice?: string };

const EMPTY: Record<ProTab, string> = {
  new: "No new requests right now. They show up here automatically.",
  review: "Nothing needs review.",
  active: "No visits booked yet.",
  done: "No finished jobs yet.",
};

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
  const view: View = q.tab === "profile" || (q.tab && q.tab in tabs) ? (q.tab as View) : "new";
  const status = profileStatus(p);
  const selected = q.job ? detail(p, q.job) : null;
  const counts = { new: tabs.new.length, review: tabs.review.length, active: tabs.active.length, done: tabs.done.length };
  const title = NAV.find((n) => n.id === view)?.label ?? "";

  return (
    <Shell p={p} view={view} counts={counts} profile={status}>
      {/* No polling while answering profile questions. */}
      {view !== "profile" && <AutoRefresh />}
      {q.error && <p className="banner error">{q.error}</p>}
      {q.notice && <p className="banner notice">{q.notice}</p>}
      {status !== "complete" && view !== "profile" && <ProfileNudge providerId={p.id} status={status} />}

      {view === "profile" ? (
        <Profile p={p} />
      ) : (
        <>
          <div className="page-head">
            <h1>{title}</h1>
            {tabs[view].length > 0 && (
              <span className="muted">
                {tabs[view].length} {tabs[view].length === 1 ? "job" : "jobs"}
              </span>
            )}
          </div>
          <div className="split">
            {view === "active" ? (
              <Schedule cards={tabs.active} providerId={p.id} providerName={p.name} selected={selected?.job.id ?? null} />
            ) : (
              <section className="list">
                {tabs[view].length === 0 && <Empty>{EMPTY[view]}</Empty>}
                {tabs[view].map((c) => (
                  <JobCard key={c.jobId} card={c} providerId={p.id} tab={view} selected={c.jobId === selected?.job.id} />
                ))}
              </section>
            )}
            {selected ? (
              <JobDetail d={selected} p={p} tab={view} />
            ) : (
              tabs[view].length > 0 && <Empty>Open a job to see the photos, what the homeowner said and your price.</Empty>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
