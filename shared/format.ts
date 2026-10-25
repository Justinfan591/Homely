export function timeAgo(value: string | number | Date) {
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(value).toLocaleDateString();
}

export function money(range: { min: number; max: number }) {
  const f = (n: number) => `CA$${Math.round(n).toLocaleString("en-CA")}`;
  return range.min === range.max ? f(range.min) : `${f(range.min)}–${f(range.max)}`;
}
