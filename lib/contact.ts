import "server-only";
import { z } from "zod";
import { HttpError } from "@/lib/auth";

/** An email address or a phone number, as typed on the sign-in screen. */
export type Contact = { kind: "email"; email: string } | { kind: "phone"; phone: string };

export function parseContact(raw: string): Contact {
  const value = raw.trim();
  if (value.includes("@")) {
    const email = z.string().email().safeParse(value.toLowerCase());
    if (!email.success) throw new HttpError(400, "That email doesn't look right.");
    return { kind: "email", email: email.data };
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new HttpError(400, "Enter a phone number or an email.");
  return { kind: "phone", phone: digits };
}

/** "(•••) •••-0142" or "m•••@gmail.com", for "We sent a code to …". */
export function maskContact(c: Contact) {
  if (c.kind === "phone") return `(•••) •••-${c.phone.slice(-4)}`;
  const [name, domain] = c.email.split("@");
  return `${name[0]}•••@${domain}`;
}

/** Phone-only accounts still need a unique email in the users table. */
export const phoneEmail = (digits: string) => `phone-${digits}@phone.scope.local`;

/** The demo has no SMS or email: every sign-in uses this code. */
export const loginCode = () => process.env.DEMO_LOGIN_CODE?.trim() || "7246";
