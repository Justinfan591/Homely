import { route, toId } from "@/lib/api";
import { jobDetail, providerFromRequest } from "@/lib/scope/pro";
import type { ProJobDetail } from "@/shared/scope";

/** Spec detail: photos by shot, AI summary, fields, answers, price range, confidence, slots. */
export const GET = route<{ id: string }>(async (req, { id }): Promise<ProJobDetail> => jobDetail(providerFromRequest(req), toId(id)));
