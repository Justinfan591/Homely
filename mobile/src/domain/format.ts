import type { PriceRange } from "./types";

export function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

export function moneyRange(r: PriceRange) {
  return `${money(r.low)}–${money(r.high)}`;
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
