import { route } from "@/lib/api";
import { homeownerScan } from "@/lib/scope/routes";
import { scanResponse } from "@/lib/scope/service";
import type { ScanResponse } from "@/shared/scope";

/** Everything the scan screens need. The app polls this every 2s while tracking. */
export const GET = route<{ id: string }>(async (_req, { id }): Promise<ScanResponse> => {
  const { scan, home } = await homeownerScan(id);
  return scanResponse(scan, home);
});
