import "server-only";
import type { User } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { toId } from "@/lib/api";
import { loadScanFor, scanResponse } from "./service";

/** Loads the signed-in homeowner's scan from the route id. */
export async function homeownerScan(id: string) {
  const user = await requireApiUser("customer");
  return { user, ...loadScanFor(user, toId(id)) };
}

/** Reloads the scan and returns the full response the app renders. */
export function freshScan(user: User, scanId: number) {
  const { scan, home } = loadScanFor(user, scanId);
  return scanResponse(scan, home);
}
