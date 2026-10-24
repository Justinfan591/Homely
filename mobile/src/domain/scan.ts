import type { Scan } from "./types";

/** The photo to put the "where is it?" dot on: the close-up if there is one, else the first photo. */
export function markShot(scan: Scan): string | null {
  const usable = scan.photos.filter((p) => p.ok && p.uri);
  return (usable.find((p) => p.shotId.includes("closeup")) ?? usable[0])?.shotId ?? null;
}
