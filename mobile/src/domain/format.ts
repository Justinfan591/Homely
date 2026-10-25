import type { PriceRange } from "./types";

export function money(n: number) {
  return `CA$${Math.round(n).toLocaleString("en-CA")}`;
}

export function moneyRange(r: PriceRange) {
  return r.low === r.high ? money(r.low) : `${money(r.low)}–${money(r.high)}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function timeOfDay(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function dayLabel(d: Date, now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, tomorrow)) return "Tomorrow";
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Today, 4 PM" */
export function slotLabel(d: Date, now = new Date()) {
  return `${dayLabel(d, now)}, ${timeOfDay(d)}`;
}

/** "Oct 12" */
export function shortDate(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return shortDate(iso);
}

export const SEVERITY_LABELS = ["Minor", "Mild", "Moderate", "Significant", "Severe"];

/** The booking windows on "When works for you?". Hours are local, end exclusive. */
export const WINDOWS = [
  { label: "Morning", range: "8 – 12", start: 8, end: 12 },
  { label: "Afternoon", range: "12 – 4", start: 12, end: 16 },
  { label: "Evening", range: "4 – 8", start: 16, end: 20 },
] as const;

export function partOfDay(d: Date) {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 16 ? "afternoon" : "evening";
}

/** "Today, morning" / "Tomorrow, evening" / "Mon, Oct 26, afternoon" */
export function windowLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  return `${dayLabel(d, now)}, ${partOfDay(d)}`;
}

/** "8 – 12" for the window a time falls in. */
export function windowRange(iso: string) {
  const h = new Date(iso).getHours();
  return (WINDOWS.find((w) => h >= w.start && h < w.end) ?? WINDOWS[h < 8 ? 0 : 2]).range;
}

/** "Tomorrow" / "Wed" for the right side of a quote. */
export function shortDay(iso: string, now = new Date()) {
  const d = new Date(iso);
  const label = dayLabel(d, now);
  return label === "Today" || label === "Tomorrow" ? label : DAYS[d.getDay()];
}
