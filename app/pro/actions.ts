"use server";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import type { Provider } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { revoke } from "@/lib/scope/calendar";
import {
  accept as acceptJob,
  addToCalendar,
  advance as advanceJob,
  askForMore,
  decline as declineJob,
  providerById,
  routeToVirtualCall,
  saveGoogle,
  saveRateCard,
} from "@/lib/scope/pro";
import { rateCardSchema } from "@/shared/scope";
import { proHref } from "./href";

type Next = Parameters<typeof proHref>[1];

/** Runs `fn` for the form's provider and job, then redirects to the page it returns (or back with the error). */
async function act(form: FormData, fn: (p: Provider, jobId: number) => Next | Promise<Next>) {
  const provider = Number(form.get("provider"));
  const jobId = Number(form.get("job"));
  let next: Next;
  try {
    next = await fn(providerById(provider), jobId);
  } catch (err) {
    if (!(err instanceof HttpError || err instanceof ZodError)) throw err;
    if (err instanceof HttpError && err.message.startsWith("Add ?provider")) redirect("/pro");
    const error = err instanceof ZodError ? (err.issues[0]?.message ?? "Invalid input") : err.message;
    next = { tab: String(form.get("tab") ?? "new"), job: jobId || undefined, error };
  }
  redirect(proHref(provider, next));
}

const acceptBody = z.object({ slot: z.string({ error: "Pick a time slot." }).min(1, "Pick a time slot."), price: z.coerce.number() });

export async function accept(form: FormData) {
  await act(form, async (p, jobId) => {
    const { slot, price } = acceptBody.parse(Object.fromEntries(form));
    acceptJob(p, jobId, { slot, price });
    // The booking stands either way; without Google the pro still has the add-to-calendar link.
    try {
      const link = await addToCalendar(p, jobId);
      return { tab: "active", job: jobId, notice: link ? "Booked and added to your Google Calendar." : undefined };
    } catch (err) {
      return { tab: "active", job: jobId, error: `Booked, but it couldn't go into Google Calendar: ${err instanceof Error ? err.message : err}` };
    }
  });
}

export async function virtualCall(form: FormData) {
  await act(form, (p, jobId) => {
    routeToVirtualCall(p, jobId);
    return { tab: "review", job: jobId };
  });
}

export async function askMore(form: FormData) {
  await act(form, (p, jobId) => {
    askForMore(p, jobId, {
      shotIds: form.getAll("shots").map(String),
      questionIds: form.getAll("questions").map(String),
      message: String(form.get("message") ?? "").trim().slice(0, 1000) || null,
    });
    return { tab: "new", job: jobId };
  });
}

export async function decline(form: FormData) {
  await act(form, (p, jobId) => {
    declineJob(p, jobId);
    return { tab: String(form.get("tab") ?? "new") };
  });
}

export async function advance(form: FormData) {
  await act(form, (p, jobId) => {
    const to = z.enum(["en_route", "done"]).parse(form.get("to"));
    advanceJob(p, jobId, to);
    return { tab: to === "done" ? "done" : "active", job: jobId };
  });
}

const n = z.coerce.number();

export async function saveRates(form: FormData) {
  const provider = Number(form.get("provider"));
  let p: Provider;
  try {
    p = providerById(provider);
  } catch {
    redirect("/pro");
  }
  const parsed = rateCardSchema.safeParse({
    base: n.parse(form.get("base")),
    per_m2: n.parse(form.get("per_m2")),
    severity_multiplier: [1, 2, 3, 4, 5].map((s) => n.parse(form.get(`m${s}`))),
  });
  if (!parsed.success) redirect(proHref(provider, { tab: "rates", error: "Rates must be numbers of 0 or more (multipliers up to 20)." }));
  saveRateCard(p, parsed.data);
  redirect(proHref(provider, { tab: "rates", saved: true }));
}

export async function disconnectGoogle(form: FormData) {
  const provider = Number(form.get("provider"));
  let p: Provider;
  try {
    p = providerById(provider);
  } catch {
    redirect("/pro");
  }
  if (p.googleRefreshToken) await revoke(p.googleRefreshToken);
  saveGoogle(p, null);
  redirect(proHref(provider, { notice: "Google Calendar disconnected." }));
}
