export function proHref(provider: number, q: { tab?: string; job?: number; error?: string; saved?: boolean } = {}) {
  const p = new URLSearchParams({ provider: String(provider) });
  if (q.tab) p.set("tab", q.tab);
  if (q.job) p.set("job", String(q.job));
  if (q.error) p.set("error", q.error);
  if (q.saved) p.set("saved", "1");
  return `/pro?${p}`;
}
