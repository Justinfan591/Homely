// End-to-end check of the homeowner app + /pro dashboard, through the same HTTP calls they make.
// Needs a running server (npm run dev) and a seeded DB (npm run setup).
//   npx tsx scripts/e2e.ts                     # report written by the support agent (no Claude calls)
//   npx tsx scripts/e2e.ts --ai                # real Claude intake (costs a few cents)
//   E2E_URL=http://localhost:3100 npx tsx scripts/e2e.ts
// It deletes the jobs it creates and restores the provider's rate card at the end.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { JobReport } from "@/shared/types";

const BASE = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const AI = process.argv.includes("--ai");
const created: number[] = [];

function step(name: string) {
  console.log(`\n▶ ${name}`);
}
function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

// ---- phone side: the same calls as mobile/src/lib/api.ts ----

async function api<T = { ok: true }>(token: string | null, p: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(BASE + p, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.body && !isForm ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${opts.method ?? "POST"} ${p} → ${res.status} ${data.error ?? ""}`);
  return data as T;
}

/** What the app does on launch with no saved token (mobile/src/lib/auth.tsx). */
async function demoLogin(email: string) {
  const r = await api<{ token: string; user: { id: number; role: string } }>(null, "/api/auth/login", { body: { email, password: "password123" } });
  return r;
}

/** A 64×64 PNG, so the test needs no fixture files. */
function png(rgb: [number, number, number]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(64).fill(rgb).flat())]);
  const raw = Buffer.concat(Array(64).fill(row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function uploadPhoto(token: string, jobId: number, label: string) {
  const form = new FormData();
  form.append("photos", new Blob([new Uint8Array(png([70, 80, 60]))], { type: "image/png" }), "e2e.png");
  form.append("labels", label);
  return api<{ photoIds: number[] }>(token, `/api/jobs/${jobId}/photos`, { body: form });
}

// ---- laptop side: submit /pro forms the way a browser without JS does ----

async function proPage(provider: number, q = "") {
  const res = await fetch(`${BASE}/pro?provider=${provider}${q}`);
  assert.equal(res.status, 200, `/pro returned ${res.status}`);
  return res.text();
}

/** Server action id of the first <form> on the page whose HTML contains `marker`. */
function actionId(html: string, marker: string, which: "form" | "button" = "form") {
  for (const m of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
    if (!m[1].includes(marker)) continue;
    const re = which === "button" ? /<button[^>]*name="\$ACTION_ID_(\w+)"/ : /<input[^>]*name="\$ACTION_ID_(\w+)"/;
    const id = m[1].match(re)?.[1];
    if (id) return id;
  }
  throw new Error(`No /pro form containing ${marker}`);
}

/** Posts a /pro form; returns the redirect target's query params. */
async function submit(provider: number, id: string, fields: Record<string, string | string[]>) {
  const form = new FormData();
  form.append(`$ACTION_ID_${id}`, "");
  form.append("provider", String(provider));
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) form.append(k, x);
  const res = await fetch(`${BASE}/pro?provider=${provider}`, { method: "POST", body: form, redirect: "manual" });
  assert.equal(res.status, 303, `form post returned ${res.status}`);
  return new URL(res.headers.get("location")!, BASE).searchParams;
}

/** min / max / value of the Accept form's price input, whatever the attribute order. */
function priceInput(html: string) {
  const tag = html.match(/<input[^>]*name="price"[^>]*>/)?.[0] ?? "";
  const attr = (n: string) => Number(tag.match(new RegExp(`${n}="(\\d+)"`))?.[1]);
  return { min: attr("min"), max: attr("max"), value: attr("value") };
}

const count = (html: string, tab: string) => Number(html.match(new RegExp(`tab=${tab}"[^>]*>[^<]*<!-- --> <span class="count">(\\d+)`))?.[1]);

// ---- the flow ----

const REPORT: JobReport = {
  title: "[e2e] Dark spotting on bathroom ceiling",
  category: "mold",
  summary: "Visible growth likely on about 3 m² of ceiling above the shower. Testing recommended.",
  urgency: "soon",
  observed_issues: ["Black spotting above shower"],
  likely_causes: ["Poor ventilation"],
  safety_hazards: [],
  scope_of_work: ["Assess and test", "Remediate affected drywall"],
  materials_likely: ["Drywall"],
  est_hours: { min: 3, max: 6 },
  est_cost_usd: { min: 400, max: 900 },
  access_notes: "Second floor bathroom",
  customer_answers: [{ question: "Musty smell?", answer: "Yes" }],
  photo_ids_referenced: [],
  confidence: "high",
  severity: 3,
  affected_area_m2: 3,
};

async function newJob(customer: string, agent: string, report: JobReport) {
  const { id } = await api<{ id: number }>(customer, "/api/jobs", { body: { address: "[e2e] 1 Test St", zip: "94110", description: "Black spots on the bathroom ceiling, musty smell" } });
  created.push(id);
  await uploadPhoto(customer, id, "Wide room");
  if (AI && report === REPORT) {
    await runIntake(customer, id);
  } else {
    // Stand-in for the AI: customer hands off, agent writes the report.
    await api(customer, `/api/jobs/${id}/status`, { body: { to: "agent_review", note: "e2e" } });
    await api(agent, `/api/jobs/${id}/report`, { method: "PUT", body: report });
  }
  return id;
}

/** Answers Claude like a homeowner tapping the first option, until a report comes back. */
async function runIntake(customer: string, id: number) {
  type Step = { kind: string; done?: boolean; data?: { questions?: { text: string; options: string[] }[] } };
  await api(customer, `/api/jobs/${id}/intake`, { body: {} });
  for (let turn = 0; turn < 6; turn++) {
    const job = await api<{ job: { status: string }; intake: Step[] }>(customer, `/api/jobs/${id}`);
    if (job.job.status === "report_ready") {
      ok(`Claude wrote a report after ${turn + 1} turn(s)`);
      return;
    }
    const pending = job.intake.findLast((s) => (s.kind === "questions" || s.kind === "photos") && !s.done);
    if (pending?.kind === "questions") {
      const answers = pending.data!.questions!.map((q) => ({ question: q.text, answer: q.options[0] ?? "Yes" }));
      await api(customer, `/api/jobs/${id}/intake`, { body: { answers } });
    } else if (pending?.kind === "photos") {
      await api(customer, `/api/jobs/${id}/intake`, { body: { skippedPhotos: true } });
    } else {
      await api(customer, `/api/jobs/${id}/intake`, { body: { text: "That's all I know. Please write the report." } });
    }
  }
  throw new Error("Claude didn't produce a report in 6 turns");
}

async function main() {
  console.log(`Molsters e2e against ${BASE}${AI ? " (with real Claude intake)" : ""}`);

  step("Phone opens with no sign-in (demo login)");
  const c = await demoLogin("customer@demo.com");
  const agent = (await demoLogin("agent@demo.com")).token;
  const customer = c.token;
  assert.equal(c.user.role, "customer");
  ok("signed in as the demo homeowner");

  const mold = db.select().from(schema.users).where(eq(schema.users.email, "mold@demo.com")).get();
  assert.ok(mold, "mold@demo.com missing: run npm run setup");
  const P = mold.id;
  const before = db.select().from(schema.providerProfiles).where(eq(schema.providerProfiles.userId, P)).get()!;

  try {
    step("Homeowner creates a job with a photo, and it gets a report");
    const id = await newJob(customer, agent, REPORT);
    let job = await api<{ job: { status: string; report: JobReport } }>(customer, `/api/jobs/${id}`);
    if (job.job.status === "report_ready") {
      await api(customer, `/api/jobs/${id}/handoff`, { body: { route: "open" } });
    } else {
      await api(agent, `/api/jobs/${id}/status`, { body: { to: "open" } });
    }
    job = await api(customer, `/api/jobs/${id}`);
    assert.equal(job.job.status, "open");
    ok(`job #${id} is open, report: "${job.job.report.title}" (${job.job.report.confidence} confidence, severity ${job.job.report.severity ?? "-"})`);
    const tab = job.job.report.confidence === "low" ? "review" : "new";

    step(`/pro shows it in ${tab === "new" ? "New" : "Needs review"} with the rate-card price`);
    let html = await proPage(P, `&tab=${tab}&job=${id}`);
    assert.ok(html.includes(job.job.report.title.replace(/&/g, "&amp;")), "job not on /pro");
    assert.ok(html.includes("Estimate — confirmed by provider"), "estimate label missing");
    const { min: low, max: high, value: price } = priceInput(html);
    if (!AI) assert.deepEqual([low, price, high], [275, 324, 373], "(150 + 40×3) × 1.2 = 324 ±15%");
    ok(`price range $${low}–$${high}, prefilled $${price}`);
    const photo = await fetch(`${BASE}/pro/photos/${(await api<{ photos: { id: number }[] }>(customer, `/api/jobs/${id}`)).photos[0].id}?provider=${P}`);
    assert.equal(photo.status, 200);
    ok("photos load on /pro");

    step("Ask for more → homeowner replies from the phone → back in New");
    let q = await submit(P, actionId(html, "Send to homeowner"), { job: String(id), tab, shots: ["The ceiling above it"], message: "Is the wall soft?" });
    assert.ok(!q.get("error"), q.get("error") ?? "");
    const waiting = await api<{ jobs: { id: number; status: string; moreInfo: { shots: string[] } | null }[] }>(customer, "/api/jobs");
    const w = waiting.jobs.find((j) => j.id === id)!;
    assert.equal(w.status, "more_info");
    assert.deepEqual(w.moreInfo?.shots, ["The ceiling above it"]);
    ok("homeowner's job list shows the request (drives the banner)");
    await uploadPhoto(customer, id, "The ceiling above it");
    await api(customer, `/api/jobs/${id}/more`, { body: { reply: "Yes, a little soft" } });
    html = await proPage(P, `&tab=new&job=${id}`);
    assert.ok(html.includes("Yes, a little soft"), "reply not shown on /pro");
    ok("reply and new photo are on the spec, job is in New");

    step("Accept: out-of-range price is refused, then a valid booking");
    const slot = html.match(/<input[^>]*name="slot"[^>]*value="([^"]+)"/)![1]; // first (default) slot
    const acceptId = actionId(html, "Confirm booking");
    q = await submit(P, acceptId, { job: String(id), tab: "new", slot, price: String(high + 100) });
    assert.match(q.get("error") ?? "", /Price must be between/);
    ok(`refused: ${q.get("error")}`);
    q = await submit(P, acceptId, { job: String(id), tab: "new", slot, price: String(price) });
    assert.equal(q.get("tab"), "active");
    const booked = await api<{ job: { status: string; slot: string; price: number }; provider: { businessName: string } }>(customer, `/api/jobs/${id}`);
    assert.equal(booked.job.status, "assigned");
    assert.equal(booked.job.price, price);
    assert.equal(new Date(booked.job.slot).toISOString(), slot);
    assert.equal(booked.provider.businessName, "Mold Busters");
    ok(`phone sees Mold Busters, $${booked.job.price}, ${new Date(booked.job.slot).toLocaleString()}`);

    step("Active job: stepper drives the phone's status");
    html = await proPage(P, `&tab=active&job=${id}`);
    assert.ok(html.includes("calendar.google.com/calendar/render"), "calendar link missing");
    for (const to of ["en_route", "in_progress", "completed"]) {
      html = await proPage(P, `&tab=active&job=${id}`);
      await submit(P, actionId(html, 'name="to"'), { job: String(id), tab: "active", to });
      const s = (await api<{ job: { status: string } }>(customer, `/api/jobs/${id}`)).job.status;
      assert.equal(s, to);
      ok(`phone shows ${s}`);
    }
    assert.equal(count(await proPage(P, "&tab=done"), "done") >= 1, true);

    step("Rate card re-prices specs");
    const id2 = await newJob(customer, agent, { ...REPORT, title: "[e2e] Handoff job", confidence: "low" });
    html = await proPage(P, "&tab=rates");
    await submit(P, actionId(html, "per_m2"), { base: "200", per_m2: "50", m1: "1", m2: "1", m3: "1", m4: "1", m5: "1" });
    html = await proPage(P, `&tab=review&job=${id2}`);
    assert.deepEqual(priceInput(html), { min: 298, max: 402, value: 350 }, "(200 + 50×3) × 1 = 350 ±15%");
    ok("new card: $298–$402, prefilled $350");

    step("Needs review: handoff job → virtual call; decline hides a job");
    assert.ok(html.includes("Handoff"));
    q = await submit(P, actionId(html, "Book a virtual call instead", "button"), { job: String(id2), tab: "review", slot });
    const vc = await api<{ job: { status: string; virtualCall: boolean; price: number | null } }>(customer, `/api/jobs/${id2}`);
    assert.deepEqual([vc.job.status, vc.job.virtualCall, vc.job.price], ["assigned", true, null]);
    ok("handoff booked as a virtual call");
    const id3 = await newJob(customer, agent, { ...REPORT, title: "[e2e] Decline me" });
    await api(agent, `/api/jobs/${id3}/status`, { body: { to: "open" } });
    html = await proPage(P, `&tab=new&job=${id3}`);
    await submit(P, actionId(html, "Decline"), { job: String(id3), tab: "new" });
    assert.ok(!(await proPage(P, "&tab=new")).includes("[e2e] Decline me"), "declined job still listed");
    assert.equal((await api<{ job: { status: string } }>(customer, `/api/jobs/${id3}`)).job.status, "open");
    ok("declined job is hidden from Mold Busters and still open for other pros");

    step("No-auth dashboard stays scoped to the provider");
    const hvac = db.select().from(schema.users).where(eq(schema.users.email, "hvac@demo.com")).get()!;
    const blocked = await fetch(`${BASE}/pro/photos/${(await api<{ photos: { id: number }[] }>(customer, `/api/jobs/${id}`)).photos[0].id}?provider=${hvac.id}`);
    assert.equal(blocked.status, 403);
    ok("another provider can't load this job's photos");

    console.log("\nAll e2e checks passed.");
  } finally {
    // Clean up everything this run created.
    if (created.length) {
      const photos = db.select().from(schema.photos).where(inArray(schema.photos.jobId, created)).all();
      db.delete(schema.messages).where(inArray(schema.messages.jobId, created)).run();
      db.delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, created)).run();
      db.delete(schema.intakeTurns).where(inArray(schema.intakeTurns.jobId, created)).run();
      db.delete(schema.photos).where(inArray(schema.photos.jobId, created)).run();
      db.delete(schema.jobs).where(inArray(schema.jobs.id, created)).run();
      for (const jid of created) await fs.rm(path.join(process.cwd(), "uploads", `job-${jid}`), { recursive: true, force: true });
      console.log(`(cleaned up ${created.length} jobs, ${photos.length} photos)`);
    }
    db.update(schema.providerProfiles).set({ rateCard: before.rateCard, jobsDone: before.jobsDone }).where(eq(schema.providerProfiles.userId, P)).run();
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
