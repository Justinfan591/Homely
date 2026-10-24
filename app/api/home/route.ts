import { z } from "zod";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { homeInfo, homeOf, homeRecord, saveHome } from "@/lib/scope/service";
import type { HomeResponse } from "@/shared/scope";

/** The homeowner's home and its Home Record (scans + jobs). */
export const GET = route(async (): Promise<HomeResponse> => {
  const user = await requireApiUser("customer");
  const home = homeOf(user);
  return { home: home ? homeInfo(home) : null, record: home ? homeRecord(home) : [] };
});

const body = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  address: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const PUT = route(async (req) => {
  const user = await requireApiUser("customer");
  return { home: homeInfo(saveHome(user, body.parse(await req.json()))) };
});
