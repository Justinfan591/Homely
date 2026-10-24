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
  sendOffer,
  withdrawOffer,
} from "@/lib/scope/pro";
import { answer as answerQuestion, retry as retryInterview, saveDescription, savePricing, saveWebsite, skip as skipQuestion, startInterview } from "@/lib/scope/profile";
import { profilePricingSchema } from "@/shared/scope";
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

/** Send or update this pro's price and time on an open request. */
export async function offer(form: FormData) {
  await act(form, (p, jobId) => {
    const { slot, price } = acceptBody.parse(Object.fromEntries(form));
    sendOffer(p, jobId, { slot, price });
    return { tab: "new", job: jobId, notice: "Offer sent. The homeowner sees it now." };
  });
}

export async function withdraw(form: FormData) {
  await act(form, (p, jobId) => {
    withdrawOffer(p, jobId);
    return { tab: "new", job: jobId, notice: "Offer withdrawn." };
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

// ---------- Profile interview ----------

/** Runs one profile step for the form's provider, then shows the Profile tab (with the error, if any). */
async function profileAct(form: FormData, fn: (p: Provider) => Promise<unknown> | unknown, notice?: string | (() => string | undefined)) {
  const provider = Number(form.get("provider"));
  let p: Provider;
  try {
    p = providerById(provider);
  } catch {
    redirect("/pro");
  }
  let next: Next;
  try {
    await fn(p);
    next = { tab: "profile", notice: typeof notice === "function" ? notice() : notice };
  } catch (err) {
    if (!(err instanceof HttpError || err instanceof ZodError)) throw err;
    next = { tab: "profile", error: err instanceof ZodError ? (err.issues[0]?.message ?? "Invalid input") : err.message };
  }
  redirect(proHref(provider, next));
}

const UNREAD_SITE = "We saved your website but couldn't read it. The questions work without it.";

/** Starts the interview. If the form has a website field, saves and reads that site first so the agent can use it. */
export async function startProfile(form: FormData) {
  const site = form.get("website");
  let unread = false;
  await profileAct(
    form,
    async (p) => {
      if (site !== null) {
        const r = await saveWebsite(p, String(site));
        unread = !!String(site).trim() && !r.read;
        p = r.provider;
      }
      return startInterview(p);
    },
    () => (unread ? UNREAD_SITE : undefined),
  );
}

export async function saveProviderWebsite(form: FormData) {
  let read = false;
  let cleared = false;
  await profileAct(
    form,
    async (p) => {
      const site = String(form.get("website") ?? "");
      cleared = !site.trim();
      read = (await saveWebsite(p, site)).read;
    },
    () => (cleared ? "Website removed." : read ? "Website saved. Redo the questions to use it in your profile." : UNREAD_SITE),
  );
}

/** After an AI hiccup: ask for the next question again (answers so far are kept). */
export async function retryProfile(form: FormData) {
  await profileAct(form, retryInterview);
}

export async function answerProfile(form: FormData) {
  await profileAct(form, (p) => answerQuestion(p, { answer: form.getAll("answer").map(String), note: String(form.get("note") ?? "") || null }));
}

export async function skipProfileQuestion(form: FormData) {
  await profileAct(form, skipQuestion);
}

const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? undefined : Number(v));

export async function saveProfilePricing(form: FormData) {
  const finishing = form.get("finishing") === "1";
  await profileAct(
    form,
    (p) => savePricing(p, profilePricingSchema.parse({ callOut: num(form.get("callOut")), perM2: num(form.get("perM2")), severePct: num(form.get("severePct")) })),
    finishing ? "Profile complete. New requests are matched with it." : "Prices saved. New quotes use them now.",
  );
}

/** The pro's edit of the agent-written summary the matching agent reads. */
export async function saveProfile(form: FormData) {
  await profileAct(form, (p) => saveDescription(p, String(form.get("description") ?? "")), "Saved. New requests are matched with this summary.");
}
