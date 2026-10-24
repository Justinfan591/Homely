import { route } from "@/lib/api";
import { requireApiUser, sessionUser } from "@/lib/auth";

export const GET = route(async () => ({ user: sessionUser(await requireApiUser()) }));
