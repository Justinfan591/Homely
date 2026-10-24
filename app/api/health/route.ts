import { route } from "@/lib/api";
import { aiMode } from "@/lib/scope/ai";
import { templates } from "@/lib/scope/templates";

/** Quick check for a UI or test script: is the server up, and which AI is it using? */
export const GET = route(async () => ({ ok: true, ai: aiMode(), trades: [...templates().keys()] }));
