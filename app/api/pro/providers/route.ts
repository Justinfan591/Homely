import { db, schema } from "@/db";
import { route } from "@/lib/api";
import { providerInfo } from "@/lib/scope/pro";

/** All providers, for the /pro provider picker. */
export const GET = route(async () => ({ providers: db.select().from(schema.providers).all().map(providerInfo) }));
