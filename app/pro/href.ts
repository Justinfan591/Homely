export type ProQuery = { tab?: string; job?: number; error?: string; saved?: boolean; notice?: string; show?: string; week?: number };

export function proHref(provider: number, q: ProQuery = {}) {
  const p = new URLSearchParams({ provider: String(provider) });
  if (q.tab) p.set("tab", q.tab);
  if (q.show) p.set("show", q.show);
  if (q.week) p.set("week", String(q.week));
  if (q.job) p.set("job", String(q.job));
  if (q.error) p.set("error", q.error);
  if (q.saved) p.set("saved", "1");
  if (q.notice) p.set("notice", q.notice);
  return `/pro?${p}`;
}
