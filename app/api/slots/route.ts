import { route } from "@/lib/api";
import { slotsFor } from "@/lib/scope/matching";

/** The three bookable times, e.g. for a virtual call when no pro is in range. */
export const GET = route(async () => ({ slots: slotsFor() }));
