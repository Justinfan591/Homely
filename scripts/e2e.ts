// End-to-end check of the two seams: the phone app's real ScopeApi client (mobile/src/services/http.ts)
// and the /pro dashboard's forms, both against a running server. scripts/e2e-scope.ts covers the raw API.
//   npm run dev:fake            # in another terminal (or npm run dev for real Claude)
//   npm run e2e                 # E2E_BASE_URL=http://localhost:3100 to point elsewhere
// It deletes the scans it creates and restores the providers it touches.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError } from "../mobile/src/services/api";
import { createHttpApi } from "../mobile/src/services/http";
import type { Job, SpecOutcome } from "../mobile/src/domain/types";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const FIX = path.join(process.cwd(), "scripts/fixtures");
const created = new Set<number>();

// The test stands in for the phone: a "uri" is a fixture file, or "dark" for a frame the check rejects.
const app = createHttpApi({
  baseUrl: BASE,
  preparePhoto: async (uri) =>
    uri === "dark" ? new Blob([new Uint8Array(200)], { type: "image/png" }) : new Blob([fs.readFileSync(path.join(FIX, uri))], { type: "image/png" }),
});

let checks = 0;
const ok = (msg: string) => {
  checks++;
  console.log(`  ✓ ${msg}`);
};
const step = (name: string) => console.log(`\n▶ ${name}`);

// ---- /pro: submit forms the way a browser does without JS ----

async function proPage(provider: number, q = "") {
  const res = await fetch(`${BASE}/pro?provider=${provider}${q}`);
  assert.equal(res.status, 200, `/pro returned ${res.status}`);
  return res.text();
}

/** Server action id of the first <form> whose HTML contains `marker`. */
function actionId(html: string, marker: string) {
  for (const m of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
    if (!m[1].includes(marker)) continue;
    const id = m[1].match(/<input[^>]*name="\$ACTION_ID_(\w+)"/)?.[1];
    if (id) return id;
  }
  throw new Error(`No /pro form containing ${marker}`);
}

async function submit(provider: number, html: string, marker: string, fields: Record<string, string | string[]>) {
  const form = new FormData();
  form.append(`$ACTION_ID_${actionId(html, marker)}`, "");
  form.append("provider", String(provider));
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) form.append(k, x);
  const res = await fetch(`${BASE}/pro?provider=${provider}`, { method: "POST", body: form, redirect: "manual" });
  assert.equal(res.status, 303, `form post returned ${res.status}`);
  return new URL(res.headers.get("location")!, BASE).searchParams;
}

/** min / max / value of the Accept price input, and the slot radios in order. */
function acceptForm(html: string) {
  const tag = html.match(/<input[^>]*name="price"[^>]*>/)?.[0] ?? "";
  const n = (a: string) => Number(tag.match(new RegExp(`${a}="(\\d+)"`))?.[1]);
  const slots = [...html.matchAll(/<input[^>]*name="slot"[^>]*value="([^"]+)"/g)].map((m) => m[1]);
  return { min: n("min"), max: n("max"), value: n("value"), slots };
}

const inTab = async (provider: number, tab: string, jobId: number) => (await proPage(provider, `&tab=${tab}`)).includes(`job=${jobId}"`);

// ---- homeowner helpers (through the app's client) ----

/** Takes every remaining shot (skipping the optional ones when asked) and returns the outcome. */
async function scanAndEstimate(trade: string, skip: string[] = [], answers?: Record<string, string>): Promise<{ scanId: string; outcome: SpecOutcome }> {
  const home = (await app.listHomes())[0];
  const scan = await app.createScan(home.id, trade);
  created.add(Number(scan.id));
  for (const shot of scan.pendingShotIds) {
    if (skip.includes(shot)) await app.skipShot(scan.id, shot);
    else assert.equal((await app.submitPhoto(scan.id, shot, "wall.png")).ok, true, `shot ${shot}`);
  }
  await app.submitAnswers(scan.id, answers ?? { duration: "1-4 weeks", smell: "Yes", leak: "No" }, "");
  return { scanId: scan.id, outcome: await app.getSpecOutcome(scan.id) };
}

const provider = (name: string) => db.select().from(schema.providers).where(eq(schema.providers.name, name)).get()!;

async function main() {
  console.log(`Scope app + /pro e2e against ${BASE}`);
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health) throw new Error(`Can't reach ${BASE}. Start it first: npm run dev:fake`);
  console.log(`AI: ${health.ai}`);

  const mb = provider("Mold Busters");
  const cs = provider("ClearSpore Remediation");
  assert.ok(mb && cs, "Scope providers missing: run npm run setup");
  const snapshot = db.select().from(schema.providers).all();

  try {
    step("App signs in by itself and loads the demo home");
    const homes = await app.listHomes();
    assert.equal(homes.length, 1);
    ok(`home "${homes[0].name}", no sign-in screen`);

    step("Scan: a bad frame is rejected, a good one accepted, an optional shot skipped");
    const home = homes[0];
    let scan = await app.createScan(home.id, "mold");
    created.add(Number(scan.id));
    assert.deepEqual(scan.pendingShotIds, ["wide_room", "closeup_affected", "ceiling_above", "adjacent_wall", "likely_water_source"]);
    const bad = await app.submitPhoto(scan.id, "wide_room", "dark");
    assert.equal(bad.ok, false);
    ok(`retake asked for: "${bad.message}"`);
    for (const s of ["wide_room", "closeup_affected", "ceiling_above", "likely_water_source"]) assert.equal((await app.submitPhoto(scan.id, s, s === "closeup_affected" ? "close.png" : "wall.png")).ok, true);
    scan = await app.skipShot(scan.id, "adjacent_wall");
    assert.deepEqual(scan.pendingShotIds, []);
    assert.equal(scan.photos.length, 4);
    ok("all shots done, photos come back as signed links");
    const photo = await fetch(scan.photos[0].uri);
    assert.equal(photo.status, 200);
    ok("a photo link loads without a token (for <Image>)");

    step("Clarify → priced, matched spec");
    await app.submitAnswers(scan.id, { duration: "1-4 weeks", smell: "Yes", leak: "No" }, "Behind the shower");
    const outcome = await app.getSpecOutcome(scan.id);
    assert.equal(outcome.kind, "match");
    if (outcome.kind !== "match") return;
    const top = outcome.options[0];
    assert.equal(top.provider.name, "Mold Busters");
    assert.ok(outcome.spec.fields.some((f) => f.label === "Likely moisture source"), "labelled fields");
    ok(`${outcome.spec.title}: severity ${outcome.spec.severity}, ${outcome.spec.areaM2} m², ${top.provider.name} ${top.price.low}–${top.price.high}`);

    step("Book with a requested time → Home Record and /pro");
    const requested = top.slots[1];
    let job: Job = await app.bookJob(scan.id, top.provider.id, requested.id);
    assert.deepEqual([job.status, job.slotConfirmed, job.slot?.start], ["pending", false, requested.start]);
    ok(`booked, waiting for the pro; requested ${requested.label}`);
    let rec = (await app.listRecord(home.id)).find((r) => r.id === scan.id)!;
    assert.equal(rec.status, "awaiting");
    assert.equal((await fetch(rec.photoUri!)).status, 200);
    ok("Home Record: awaiting confirmation, with a thumbnail");
    const jobId = db.select().from(schema.scopeJobs).where(eq(schema.scopeJobs.scanId, Number(scan.id))).get()!.id;
    assert.ok(await inTab(mb.id, "new", jobId), "in New");
    let html = await proPage(mb.id, `&tab=new&job=${jobId}`);
    assert.ok(html.includes("Homeowner&#x27;s pick") || html.includes("Homeowner's pick"), "requested slot badge");
    assert.equal(acceptForm(html).slots[0], requested.start);
    ok("/pro New tab lists it, with the homeowner's time pre-selected");

    step("Ask for more (a shot + a question) → phone rescans only those → back in New");
    await submit(mb.id, html, "Send to homeowner", { job: String(jobId), tab: "new", shots: ["closeup_affected"], questions: ["smell"], message: "A bit closer please." });
    assert.ok(await inTab(mb.id, "new", jobId), "stays in New while waiting");
    assert.ok((await proPage(mb.id, "&tab=new")).includes("Waiting for homeowner"));
    rec = (await app.listRecord(home.id)).find((r) => r.id === scan.id)!;
    assert.deepEqual([rec.status, rec.followUp?.message, rec.href], ["needs_info", "A bit closer please.", `/scan/${scan.id}`]);
    assert.equal((await app.getJob(job.id)).status, "more_info");
    ok("phone shows the banner and the request");
    scan = await app.getScan(scan.id);
    assert.deepEqual([scan.pendingShotIds, scan.followUp?.questionIds], [["closeup_affected"], ["smell"]]);
    ok("opening it asks for just the close-up and the smell question");
    assert.equal((await app.submitPhoto(scan.id, "closeup_affected", "close.png")).ok, true);
    await app.submitAnswers(scan.id, { smell: "No" }, "It's dry now.");
    const again = await app.getSpecOutcome(scan.id);
    assert.deepEqual([again.kind, again.kind === "submitted" && again.jobId], ["submitted", scan.id]);
    assert.equal((await app.getJob(job.id)).status, "pending");
    html = await proPage(mb.id, `&tab=new&job=${jobId}`);
    const notes = html.match(/<h4>Notes<\/h4>[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.ok(html.includes("spec v<!-- -->2") || html.includes("spec v2"), "spec v2");
    assert.ok(notes.includes("Reply to the pro:") && notes.includes("dry now."), `reply in notes: ${notes}`);
    ok("spec v2 back in the pro's New tab with the reply; phone goes to tracking");

    step("Accept: out-of-range price refused, then the requested slot confirmed");
    const f = acceptForm(html);
    let q = await submit(mb.id, html, "Confirm booking", { job: String(jobId), tab: "new", slot: f.slots[0], price: String(f.max + 50) });
    assert.match(q.get("error") ?? "", /Price must be between/);
    ok(`refused: ${q.get("error")}`);
    q = await submit(mb.id, html, "Confirm booking", { job: String(jobId), tab: "new", slot: f.slots[0], price: String(f.value) });
    assert.equal(q.get("tab"), "active");
    job = await app.getJob(job.id);
    assert.deepEqual([job.status, job.slotConfirmed, job.slot?.start, job.price], ["accepted", true, requested.start, { low: f.value, high: f.value }]);
    ok(`phone: ${job.providerName} booked ${job.slot?.label}, $${f.value}`);

    step("Stepper drives the phone; homeowner rates");
    html = await proPage(mb.id, `&tab=active&job=${jobId}`);
    assert.ok(html.includes("calendar.google.com/calendar/render"));
    await submit(mb.id, html, 'name="to"', { job: String(jobId), tab: "active", to: "en_route" });
    job = await app.getJob(job.id);
    assert.equal(job.status, "en_route");
    assert.equal(typeof job.etaMinutes, "number");
    ok(`on the way, arriving in ${job.etaMinutes} min`);
    html = await proPage(mb.id, `&tab=active&job=${jobId}`);
    await submit(mb.id, html, 'name="to"', { job: String(jobId), tab: "active", to: "done" });
    job = await app.rateJob(job.id, 5);
    assert.deepEqual([job.status, job.rating], ["done", 5]);
    assert.ok(await inTab(mb.id, "done", jobId));
    assert.equal((await app.listRecord(home.id)).find((r) => r.id === scan.id)?.status, "done");
    ok("done, rated 5, in the pro's Done tab and the Home Record");

    step("Decline → phone offers the next pro → all decline → virtual call at a picked time");
    const d = await scanAndEstimate("mold");
    assert.equal(d.outcome.kind, "match");
    await app.bookJob(d.scanId, String(mb.id), (d.outcome as Extract<SpecOutcome, { kind: "match" }>).options[0].slots[0].id);
    const dJob = db.select().from(schema.scopeJobs).where(eq(schema.scopeJobs.scanId, Number(d.scanId))).get()!.id;
    await submit(mb.id, await proPage(mb.id, `&tab=new&job=${dJob}`), "Decline", { job: String(dJob), tab: "new" });
    assert.equal((await app.getJob(d.scanId)).status, "declined");
    let next = await app.getSpecOutcome(d.scanId);
    assert.ok(next.kind === "match" && next.options.every((o) => o.provider.name !== "Mold Busters") && next.options[0].provider.name === "ClearSpore Remediation");
    ok("Mold Busters declined; ClearSpore offered instead");
    await app.bookJob(d.scanId, String(cs.id), next.kind === "match" ? next.options[0].slots[0].id : "");
    assert.equal((await app.getJob(d.scanId)).providerName, "ClearSpore Remediation");
    await submit(cs.id, await proPage(cs.id, `&tab=new&job=${dJob}`), "Decline", { job: String(dJob), tab: "new" });
    next = await app.getSpecOutcome(d.scanId);
    assert.equal(next.kind, "no_provider");
    const vSlots = await app.listVirtualSlots();
    const v = await app.bookVirtualCall(d.scanId, vSlots[2].id);
    assert.deepEqual([v.status, v.virtual, v.slot?.start], ["pending", true, vSlots[2].start]);
    ok(`nobody left nearby → virtual call requested for ${vSlots[2].label}`);

    step("Talk to a person → Needs review → routed to a virtual call; homeowner cancels");
    const hScan = await scanAndEstimate("mold", ["ceiling_above"]);
    const handoff = await app.askForHuman(hScan.scanId);
    assert.equal(handoff.kind, "handoff");
    assert.equal((await app.getJob(hScan.scanId)).status, "handoff");
    const hJob = db.select().from(schema.scopeJobs).where(eq(schema.scopeJobs.scanId, Number(hScan.scanId))).get()!.id;
    assert.ok(await inTab(mb.id, "review", hJob), "in Needs review");
    html = await proPage(mb.id, `&tab=review&job=${hJob}`);
    assert.ok(html.includes("Handoff"));
    await submit(mb.id, html, "Route to a virtual call", { job: String(hJob), tab: "review" });
    const hv = await app.getJob(hScan.scanId);
    assert.deepEqual([hv.status, hv.virtual], ["pending", true]);
    ok("specialist routed it to a virtual call");
    const cancelled = await app.cancelJob(hScan.scanId);
    assert.equal(cancelled.status, "cancelled");
    assert.ok(!(await inTab(mb.id, "review", hJob)));
    ok("homeowner cancelled; gone from /pro");

    step("Second trade uses the shared template (plumbing ids match the server)");
    const p = await scanAndEstimate("plumbing_sink", ["faucet_top"], { leak_rate: "Slow drip", water_off: "Yes" });
    assert.ok(p.outcome.kind === "match" && p.outcome.spec.fields.some((x) => x.label === "Leak location"));
    ok(`plumbing spec: "${p.outcome.spec.title}"; optional "age" question left blank`);

    step("App restarted between the questions and the estimate → back to the questions");
    const fresh = createHttpApi({ baseUrl: BASE, preparePhoto: async () => new Blob([fs.readFileSync(path.join(FIX, "wall.png"))], { type: "image/png" }) });
    const lost = await fresh.createScan(home.id, "mold");
    created.add(Number(lost.id));
    for (const shot of lost.pendingShotIds) assert.equal((await fresh.submitPhoto(lost.id, shot, "wall.png")).ok, true);
    await fresh.submitAnswers(lost.id, { duration: "Months", smell: "Yes", leak: "No" }, "");
    // A new client instance has no answers in memory, like the app after a restart.
    const restarted = createHttpApi({ baseUrl: BASE, preparePhoto: async () => new Blob([]) });
    await assert.rejects(restarted.getSpecOutcome(lost.id), (e: unknown) => e instanceof ApiError && e.code === "needs_answers");
    ok("estimate asks for the answers again instead of failing");
    await restarted.submitAnswers(lost.id, { duration: "Months", smell: "Yes", leak: "No" }, "");
    assert.equal((await restarted.getSpecOutcome(lost.id)).kind, "match");
    ok("answering again gives the estimate");

    step("Rate card re-prices the queue");
    const r = await scanAndEstimate("mold");
    assert.equal(r.outcome.kind, "match");
    await app.bookJob(r.scanId, String(mb.id), (r.outcome as Extract<SpecOutcome, { kind: "match" }>).options[0].slots[0].id);
    const rJob = db.select().from(schema.scopeJobs).where(eq(schema.scopeJobs.scanId, Number(r.scanId))).get()!.id;
    const spec = db.select().from(schema.jobSpecs).where(eq(schema.jobSpecs.scanId, Number(r.scanId))).get()!;
    await submit(mb.id, await proPage(mb.id, "&tab=rates"), "per_m2", { base: "200", per_m2: "50", m1: "1", m2: "1", m3: "1", m4: "1", m5: "1" });
    const want = Math.round((200 + 50 * spec.areaM2) / 5) * 5;
    assert.equal(acceptForm(await proPage(mb.id, `&tab=new&job=${rJob}`)).value, want);
    ok(`(200 + 50 × ${spec.areaM2}) × 1 → $${want}`);

    console.log(`\nAll ${checks} checks passed.`);
  } finally {
    const ids = [...created];
    if (ids.length) {
      const jobs = db.select().from(schema.scopeJobs).where(inArray(schema.scopeJobs.scanId, ids)).all();
      db.transaction((tx) => {
        if (jobs.length) tx.delete(schema.ratings).where(inArray(schema.ratings.jobId, jobs.map((j) => j.id))).run();
        tx.delete(schema.scopeJobs).where(inArray(schema.scopeJobs.scanId, ids)).run();
        tx.delete(schema.jobSpecs).where(inArray(schema.jobSpecs.scanId, ids)).run();
        tx.delete(schema.scanPhotos).where(inArray(schema.scanPhotos.scanId, ids)).run();
        tx.delete(schema.scans).where(inArray(schema.scans.id, ids)).run();
        for (const s of snapshot) {
          tx.update(schema.providers).set({ rating: s.rating, ratingCount: s.ratingCount, rateCard: s.rateCard }).where(eq(schema.providers.id, s.id)).run();
        }
      });
      for (const id of ids) fs.rmSync(path.join(process.cwd(), "uploads", `scan-${id}`), { recursive: true, force: true });
      console.log(`(cleaned up ${ids.length} scans; providers restored)`);
    }
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
