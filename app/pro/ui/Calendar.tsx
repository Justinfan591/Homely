import type { Provider } from "@/db/schema";
import { googleConfig } from "@/lib/scope/calendar";
import type { ProJobDetail } from "@/shared/scope";
import { disconnectGoogle } from "../actions";

/** Connected calendar, a Connect button, or a setup hint when the OAuth client isn't configured. */
export function CalendarStatus({ p }: { p: Provider }) {
  if (p.googleCalendar) {
    return (
      <form action={disconnectGoogle} className="cal">
        <input type="hidden" name="provider" value={p.id} />
        <span>📅 {p.googleCalendar}</span>
        <button className="btn ghost small-btn" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
          Disconnect calendar
        </button>
      </form>
    );
  }
  if (!googleConfig()) return <span className="muted">Google Calendar: set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (README)</span>;
  return (
    <a className="btn small-btn" href={`/pro/google/connect?provider=${p.id}`}>
      📅 Connect Google Calendar
    </a>
  );
}

/** Fallback when the pro hasn't connected: a prefilled "add to Google Calendar" link. No OAuth needed. */
export function googleCalendarUrl(job: { id: number; slot: string; mode: string }, title: string, summary: string, address: string, providerName: string) {
  const fmt = (x: Date) => x.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const start = new Date(job.slot);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${providerName}: ${title}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Scope job #${job.id}\n\n${summary}`,
    location: job.mode === "virtual" ? "Virtual call" : address,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** The calendar link for an accepted job: the event in their connected calendar, or a prefilled add link. */
export function CalendarLink({ d, providerName }: { d: ProJobDetail; providerName: string }) {
  if (!d.job.slot) return null;
  return d.calendarLink ? (
    <a href={d.calendarLink} target="_blank" rel="noreferrer">
      In your Google Calendar ↗
    </a>
  ) : (
    <a href={googleCalendarUrl({ id: d.job.id, slot: d.job.slot, mode: d.job.mode }, d.spec.title, d.spec.summary, d.home.address, providerName)} target="_blank" rel="noreferrer">
      Add to Google Calendar
    </a>
  );
}
