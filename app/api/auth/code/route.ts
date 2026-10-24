import { z } from "zod";
import { route } from "@/lib/api";
import { loginCode, maskContact, parseContact } from "@/lib/contact";

const body = z.object({ contact: z.string().max(200) });

/**
 * Step 1 of sign-in: "send" a code to a phone or email. Nothing is sent in the demo;
 * the code is always DEMO_LOGIN_CODE (default 7246).
 */
export const POST = route(async (req) => {
  const contact = parseContact(body.parse(await req.json()).contact);
  return { sentTo: maskContact(contact), length: loginCode().length };
});
