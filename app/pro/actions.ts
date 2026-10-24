"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { db, schema } from "@/db";
import { HttpError } from "@/lib/auth";
import { loadJobFor, logEvent, transition } from "@/lib/jobs";
import { priceFor, proProvider, type Pro, type ProJob } from "@/lib/pro";
import { proHref } from "./href";

const ids = z.object({ provider: z.coerce.number().int(), job: z.coerce.number().int() });

/** Loads the provider and job from the form, runs `fn`, then redirects to the page it returns (or back with the error). */
async function act(form: FormData, fn: (pro: Pro, job: ProJob) => { tab: string; job?: number }) {
  const { provider, job: jobId } = ids.parse(Object.fromEntries(form));
  const pro = proProvider(provider);
  if (!pro) redirect("/pro");
  let next: Parameters<typeof proHref>[1];
  try {
    const job = loadJobFor(pro.user, jobId);
    if (!job.report) throw new HttpError(409, "This job has no spec yet.");
    next = fn(pro, job as ProJob);
  } catch (err) {
    if (!(err instanceof HttpError || err instanceof ZodError)) throw err;
    const message = err instanceof ZodError ? (err.issues[0]?.message ?? "Invalid input") : err.message;
    next = { tab: String(form.get("tab") ?? "new"), job: jobId, error: message };
  }
  redirect(proHref(provider, next));
}

const acceptBody = z.object({ slot: z.coerce.date({ error: "Pick a time slot." }), price: z.coerce.number() });

export async function accept(form: FormData) {
  await act(form, (pro, job) => {
    const { slot, price } = acceptBody.parse(Object.fromEntries(form));
    const range = priceFor(job, pro);
    if (price < range.low || price > range.high) {
      throw new HttpError(400, `Price must be between $${range.low} and $${range.high}.`);
    }
    transition(job, "assigned", pro.user, {
      note: `Accepted by ${pro.profile.businessName ?? pro.user.name} for $${Math.round(price)}`,
      set: { providerId: pro.user.id, slot, price: Math.round(price), virtualCall: false },
    });
    return { tab: "active", job: job.id };
  });
}

export async function virtualCall(form: FormData) {
  await act(form, (pro, job) => {
    const { slot } = acceptBody.pick({ slot: true }).parse(Object.fromEntries(form));
    transition(job, "assigned", pro.user, {
      note: `Routed to a ${pro.profile.businessName ?? pro.user.name} virtual call`,
      set: { providerId: pro.user.id, slot, price: null, virtualCall: true },
    });
    return { tab: "active", job: job.id };
  });
}

export async function askMore(form: FormData) {
  await act(form, (pro, job) => {
    const shots = form.getAll("shots").map(String).filter(Boolean);
    const message = String(form.get("message") ?? "").trim().slice(0, 1000);
    if (!shots.length && !message) throw new HttpError(400, "Pick at least one shot or write what you need.");
    const name = pro.profile.businessName ?? pro.user.name;
    transition(job, "more_info", pro.user, {
      note: `${name} asked for more: ${[...shots, message].filter(Boolean).join("; ")}`,
      set: { moreInfo: { providerId: pro.user.id, providerName: name, message, shots } },
    });
    return { tab: "new", job: job.id };
  });
}

export async function decline(form: FormData) {
  await act(form, (pro, job) => {
    db.update(schema.jobs)
      .set({ declinedBy: [...new Set([...job.declinedBy, pro.user.id])] })
      .where(eq(schema.jobs.id, job.id))
      .run();
    logEvent(job.id, pro.user.id, job.status, `Declined by ${pro.profile.businessName ?? pro.user.name}`);
    return { tab: String(form.get("tab") ?? "new") };
  });
}

export async function advance(form: FormData) {
  await act(form, (pro, job) => {
    const to = z.enum(["en_route", "in_progress", "completed"]).parse(form.get("to"));
    transition(job, to, pro.user);
    return { tab: to === "completed" ? "done" : "active", job: job.id };
  });
}

const n = z.coerce.number().min(0);
const rateBody = z.object({ base: n, per_m2: n, m1: n, m2: n, m3: n, m4: n, m5: n });

export async function saveRates(form: FormData) {
  const pro = proProvider(form.get("provider"));
  if (!pro) redirect("/pro");
  const parsed = rateBody.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(proHref(pro.user.id, { tab: "rates", error: "Rates must be numbers of 0 or more." }));
  const r = parsed.data;
  db.update(schema.providerProfiles)
    .set({ rateCard: { base: r.base, per_m2: r.per_m2, severity_multiplier: [r.m1, r.m2, r.m3, r.m4, r.m5] } })
    .where(eq(schema.providerProfiles.userId, pro.user.id))
    .run();
  redirect(proHref(pro.user.id, { tab: "rates", saved: true }));
}
