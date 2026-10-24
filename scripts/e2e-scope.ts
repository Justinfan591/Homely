// End-to-end test of the Scope homeowner flow (and the /pro actions that drive it),
// through the same typed client a UI uses (shared/scope-client.ts).
//
//   npm run dev:fake        # terminal 1: API server with the fake AI (free, instant, predictable)
//   npm run test:e2e        # terminal 2
//
// Also works against a server using real Claude (`npm run dev`): AI-dependent checks
// become warnings instead of failures, and it makes ~25 Claude calls.
//
// It signs up a throwaway homeowner, runs every flow, then deletes that homeowner's data
// and restores provider ratings and rate cards. Pass --keep to leave the data in place.
//   E2E_BASE_URL   server to test (default http://localhost:3000)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { inArray, eq } from "drizzle-orm";
import { createScopeClient, ScopeApiError, type ScopeClient } from "../shared/scope-client";
import { HANDOFF_CONFIDENCE, quote, type ProProvider, type ScanResponse, type Template } from "../shared/scope";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const KEEP = process.argv.includes("--keep");
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the defaults.
}
const CENTER = { lat: Number(process.env.DEMO_LAT) || 45.5019, lng: Number(process.env.DEMO_LNG) || -73.5674 };

// ---------- Tiny test harness ----------

let failures = 0;
let warnings = 0;
let checks = 0;
let fake = true;

class CheckFailed extends Error {}

function check(cond: unknown, what: string): asserts cond {
  checks++;
  if (!cond) throw new CheckFailed(what);
}
/** For checks that depend on what real Claude decides: fail in fake mode, warn with real AI. */
function aiCheck(cond: unknown, what: string) {
  if (fake) return check(cond, what);
  checks++;
  if (!cond) {
    warnings++;
    console.log(`    ! warning (real AI): ${what}`);
  }
}
async function rejects(p: Promise<unknown>, status: number, what: string) {
  try {
    await p;
  } catch (err) {
    if (err instanceof ScopeApiError) {
      check(err.status === status, `${what}: expected ${status}, got ${err.status} (${err.message})`);
      return err;
    }
    throw err;
  }
  check(false, `${what}: expected ${status}, but it succeeded`);
}

async function flow(name: string, fn: () => Promise<void>) {
  const before = checks;
  const t0 = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name}  (${checks - before} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
    if (!(err instanceof CheckFailed) && !(err instanceof ScopeApiError)) console.log(err);
  }
}

// ---------- Fixtures ----------

const fixture = (name: string) => new Blob([fs.readFileSync(path.join(__dirname, "fixtures", name))], { type: "image/png" });
const WALL = fixture("wall.png");
const CLOSE = fixture("close.png");
/** Solid black 64×64 PNG, generated: rejected as too dark (by Claude) and by the fake AI (< 2 KB). */
const BLACK = (() => {
  const W = 64;
  const raw = Buffer.alloc((W * 3 + 1) * W);
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const td = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(W, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return new Blob([png], { type: "image/png" });
})();

// ---------- Helpers over the client ----------

let api: ScopeClient;
let token = "";
let byName: Record<string, ProProvider> = {};
const pro = (name: string) => api.pro(byName[name].id);

/** First option for every required question (optional ones left blank). */
const answersFor = (t: Template, only?: string[]) =>
  Object.fromEntries(t.questions.filter((q) => (only ? only.includes(q.id) : !q.optional)).map((q) => [q.id, q.options[0]]));

/** Captures the two key shots with real-looking photos and skips the optional ones. */
async function capture(scanId: number) {
  let s = await api.homeowner.scan(scanId);
  for (const id of s.remainingShots) {
    const shot = s.template.required_shots.find((x) => x.id === id)!;
    const r = shot.optional ? await api.homeowner.skipShot(scanId, id) : await api.homeowner.uploadShot(scanId, id, id.includes("close") ? CLOSE : WALL, `${id}.png`);
    if (!r.ok) throw new CheckFailed(`Shot "${id}" was rejected: ${r.message}`);
  }
  s = await api.homeowner.scan(scanId);
  check(s.scan.status === "clarifying", `all shots done → clarifying (got ${s.scan.status})`);
  return s;
}

/** Start → capture → answer → spec. Returns the scan once the spec is ready (or handed off). */
async function scanToSpec(trade = "mold", notes: string | null = "Behind the bathroom door.") {
  const { id } = await api.homeowner.startScan(trade);
  const s = await capture(id);
  return api.homeowner.finish(id, answersFor(s.template), notes);
}

/** A booked job, or null if real Claude handed it off for low confidence. */
async function bookedWith(name: string) {
  const s = await scanToSpec();
  if (s.scan.status !== "spec_ready") {
    aiCheck(false, `spec confidence ${s.spec?.confidence} — expected ≥ ${HANDOFF_CONFIDENCE}`);
    return null;
  }
  const booked = await api.homeowner.book(s.scan.id, byName[name].id);
  return { scanId: s.scan.id, jobId: booked.job!.id };
}

const inTab = async (name: string, tab: "new" | "review" | "active" | "done", jobId: number) => (await pro(name).queue()).tabs[tab].some((c) => c.jobId === jobId);

async function raw(pathname: string, init: RequestInit = {}) {
  return fetch(`${BASE}${pathname}`, init);
}

// ---------- Flows ----------

async function main() {
  console.log(`Scope e2e against ${BASE}`);
  api = createScopeClient({ baseUrl: BASE, getToken: () => token });

  let health;
  try {
    health = await api.health();
  } catch (err) {
    console.error(`\nCan't reach the API at ${BASE} (${(err as Error).message}).\nStart it first: npm run dev:fake`);
    process.exit(2);
  }
  if (health.ai === "missing_key") {
    console.error("\nThe server has no ANTHROPIC_API_KEY. Restart it with the fake AI: npm run dev:fake");
    process.exit(2);
  }
  fake = health.ai === "fake";
  console.log(fake ? "AI: fake (deterministic)\n" : "AI: real Claude — AI-dependent checks are warnings; this makes ~25 API calls\n");

  const providers = (await api.providers()).providers;
  byName = Object.fromEntries(providers.map((p) => [p.name, p]));
  for (const n of ["Mold Busters", "ClearSpore Remediation", "Northshore Mold Co", "Clearwater Plumbing", "Pipeline Pros"]) {
    if (!byName[n]) {
      console.error(`Provider "${n}" is missing. Run: npm run db:seed`);
      process.exit(2);
    }
  }
  const snapshot = providers.map((p) => ({ id: p.id, rating: p.rating, ratingCount: p.ratingCount, rateCard: p.rateCard }));
  const email = `e2e-${Date.now()}@scope.test`;
  const userIds: number[] = [];

  try {
    await flow("Sign up, set home, list trades", async () => {
      await rejects(api.homeowner.home(), 401, "home without a token");
      const res = await api.auth.signup({ name: "E2E Homeowner", email, password: "e2e-password" });
      token = res.token;
      userIds.push(res.user.id);
      check(res.user.role === "customer", "signup makes a customer");
      const h0 = await api.homeowner.home();
      check(h0.home === null && h0.record.length === 0, "new homeowner has no home and an empty record");
      await rejects(api.homeowner.startScan("mold"), 409, "scan before the home is set");
      const h1 = await api.homeowner.setHome({ address: "1 Test Street", ...CENTER });
      check(h1.home.address === "1 Test Street", "home saved");
      const { templates } = await api.homeowner.templates();
      check(["mold", "plumbing_sink"].every((t) => templates.some((x) => x.trade === t)), "mold and plumbing_sink templates ship");
      await rejects(api.homeowner.startScan("roofing"), 404, "unknown trade");
    });

    await flow("Happy path: scan → retake → skip → questions → spec → book → accept → en route → done → rate", async () => {
      const mb = byName["Mold Busters"];
      const { id } = await api.homeowner.startScan("mold");
      let s = await api.homeowner.scan(id);
      check(s.scan.status === "capturing", "new scan is capturing");
      check(s.remainingShots.join() === s.template.required_shots.map((x) => x.id).join(), "every template shot is still to capture, in order");

      // Bad photo → retake.
      const bad = await api.homeowner.uploadShot(id, "wide_room", BLACK, "dark.png");
      aiCheck(!bad.ok && bad.message.length > 0, `black photo asks for a retake (ok=${bad.ok}, "${bad.message}")`);
      if (!bad.ok) check(bad.remainingShots.includes("wide_room"), "rejected shot stays in remainingShots");
      await rejects(api.homeowner.skipShot(id, "wide_room"), 400, "skipping a required shot");
      await rejects(api.homeowner.uploadShot(id, "not_a_shot", WALL), 400, "unknown shot id");
      await rejects(api.homeowner.finish(id, {}), 409, "finishing while still capturing");

      // Good photos, skip the optional ones.
      s = await capture(id);
      check(s.remainingShots.length === 0, "no shots left");
      check(s.scan.skippedShots.length === s.template.required_shots.filter((x) => x.optional).length, "optional shots recorded as skipped");

      // Questions.
      await rejects(api.homeowner.finish(id, {}), 400, "missing answers");
      await rejects(api.homeowner.finish(id, { ...answersFor(s.template), smell: "Maybe" }), 400, "answer that isn't an option");
      s = await api.homeowner.finish(id, answersFor(s.template), "Behind the bathroom door.");
      if (s.scan.status !== "spec_ready") {
        aiCheck(false, `spec confidence ${s.spec?.confidence} — expected ≥ ${HANDOFF_CONFIDENCE}; rest of flow skipped`);
        return;
      }
      const spec = s.spec!;
      check(spec.version === 1 && spec.severity >= 1 && spec.severity <= 5 && spec.areaM2 >= 0, "spec v1 with severity 1-5 and an area");
      check(spec.confidence >= HANDOFF_CONFIDENCE && spec.confidence <= 1, "confidence in [0.6, 1]");
      check(s.template.outputs.filter((k) => k !== "severity" && k !== "affected_area_m2").every((k) => typeof spec.fields[k] === "string"), "every template output field filled");
      aiCheck(spec.summary.toLowerCase().includes("testing recommended"), `summary uses the policy wording ("${spec.summary.slice(0, 80)}…")`);
      check(!/\$\d/.test(spec.summary + spec.title), "the AI text contains no prices");
      check(s.scan.notes === "Behind the bathroom door.", "note saved");

      // Matching + deterministic pricing.
      const names = s.matches.map((m) => m.name);
      check(names.includes("Mold Busters") && names.includes("ClearSpore Remediation"), `in-range mold pros match (${names.join(", ")})`);
      check(!names.includes("Northshore Mold Co"), "out-of-range pro is filtered out");
      check(!names.some((n) => n.includes("Plumbing") || n.includes("Pipeline")), "other trades are filtered out");
      check(s.matches.every((m, i) => i === 0 || s.matches[i - 1].rating >= m.rating), "ranked by rating");
      for (const m of s.matches) {
        const want = quote(byName[m.name].rateCard, spec);
        check(m.quote.price === want.price && m.quote.low === want.low && m.quote.high === want.high, `${m.name} quote = rate card formula`);
        check(m.slots.length === 3 && m.slots.every((x) => new Date(x.startsAt).getTime() > Date.now()), `${m.name} offers 3 future slots`);
        check(m.etaMinutes > 0 && m.distanceKm >= 0, `${m.name} has distance and ETA`);
      }
      check(spec.priceLow === s.matches[0].quote.low && spec.priceHigh === s.matches[0].quote.high, "spec range priced for the top match");

      // Photos: signed src works alone; url needs the token; pros only see their jobs.
      const photo = s.photos.find((p) => p.ok)!;
      const rejected = s.photos.find((p) => !p.ok);
      if (!bad.ok) check(rejected && rejected.feedback, "rejected photo is listed with its feedback");
      const img = await raw(photo.src);
      check(img.status === 200 && img.headers.get("content-type") === "image/png", `signed src loads without a token (${img.status})`);
      check((await raw(photo.src.replace(/sig=[^&]+/, "sig=forged"))).status === 403, "forged signature is refused");
      check((await raw(photo.url)).status === 401, "plain url needs a token");
      check((await raw(photo.url, { headers: { Authorization: `Bearer ${token}` } })).status === 200, "plain url works with the token");
      check((await raw(`${photo.url}?provider=${mb.id}`)).status === 404, "pros can't see photos before a job exists");

      // Book.
      await rejects(api.homeowner.book(id, byName["Northshore Mold Co"].id), 400, "booking an out-of-range pro");
      await rejects(api.homeowner.rate(id, 5), 409, "rating before the job is done");
      s = await api.homeowner.book(id, mb.id);
      check(s.scan.status === "submitted" && s.job?.status === "pending" && s.job.provider?.id === mb.id, "booked: job pending with Mold Busters");
      check(s.matches.length === 0, "no more matches once booked");
      await rejects(api.homeowner.book(id, mb.id), 409, "booking twice");
      const jobId = s.job!.id;
      const rec = (await api.homeowner.home()).record.find((r) => r.scanId === id);
      check(rec?.jobStatus === "pending" && rec.providerName === "Mold Busters" && !rec.needsAction, "Home Record shows the booked job");

      // Pro side.
      const q = await pro("Mold Busters").queue();
      const card = q.tabs.new.find((c) => c.jobId === jobId);
      check(card && card.quote.low === spec.priceLow && card.confidence === spec.confidence, "job is in Mold Busters' New tab with the same quote");
      await rejects(pro("ClearSpore Remediation").job(jobId), 404, "another pro can't open the job");
      const d = await pro("Mold Busters").job(jobId);
      check(d.photos.length >= 2 && d.photos.every((p) => p.ok), "pro sees the usable photos only");
      check(d.answers.length === s.template.questions.filter((x) => !x.optional).length, "pro sees readable answers");
      check(d.home.address === "1 Test Street", "assigned pro sees the address");
      check((await raw(d.photos[0].src)).status === 200, "pro's signed photo src loads");
      check((await raw(`${d.photos[0].url}?provider=${mb.id}`)).status === 200, "photo via ?provider= for the assigned pro");
      check((await raw(`${d.photos[0].url}?provider=${byName["ClearSpore Remediation"].id}`)).status === 404, "photo hidden from other pros");

      // Accept.
      await rejects(pro("Mold Busters").accept(jobId, { slot: d.slots[0].startsAt, price: d.quote.high + 50 }), 400, "price above the range");
      await rejects(pro("Mold Busters").accept(jobId, { slot: new Date(Date.now() - 86400000).toISOString(), price: d.quote.price }), 400, "slot in the past");
      const acc = await pro("Mold Busters").accept(jobId, { slot: d.slots[0].startsAt, price: d.quote.price });
      check(acc.job.status === "accepted", "pro accepted");
      await rejects(pro("Mold Busters").accept(jobId, { slot: d.slots[0].startsAt, price: d.quote.price }), 409, "accepting twice");
      s = await api.homeowner.scan(id);
      check(s.job?.status === "accepted" && s.job.price === d.quote.price && s.job.slot === d.slots[0].startsAt && s.job.eta === s.job.slot, "phone shows booked slot + confirmed price");
      check(await inTab("Mold Busters", "active", jobId), "job in Active tab");

      // En route → done.
      await rejects(pro("Mold Busters").setStatus(jobId, "done"), 409, "done before en route (on-site job)");
      await pro("Mold Busters").setStatus(jobId, "en_route");
      s = await api.homeowner.scan(id);
      const etaMin = (new Date(s.job!.eta!).getTime() - Date.now()) / 60000;
      check(s.job?.status === "en_route" && etaMin > 5 && etaMin < 60, `phone shows the pro on the way (ETA in ${etaMin.toFixed(0)} min)`);
      await pro("Mold Busters").setStatus(jobId, "done");
      s = await api.homeowner.scan(id);
      check(s.job?.status === "done" && s.job.eta === null, "phone shows done");
      check((await api.homeowner.home()).record.find((r) => r.scanId === id)?.needsAction === true, "Home Record asks for a rating");

      // Rate.
      const before = (await api.providers()).providers.find((p) => p.id === mb.id)!;
      s = await api.homeowner.rate(id, 5);
      check(s.job?.rating === 5, "rating saved");
      const after = (await api.providers()).providers.find((p) => p.id === mb.id)!;
      check(after.ratingCount === before.ratingCount + 1, "provider rating count +1");
      await rejects(api.homeowner.rate(id, 4), 409, "rating twice");
      check((await api.homeowner.home()).record.find((r) => r.scanId === id)?.needsAction === false, "nothing left to do");
      check(await inTab("Mold Busters", "done", jobId), "job in Done tab");
    });

    await flow("Ask for more: pro requests a shot + question → phone rescans only those → spec v2 back in New", async () => {
      const b = await bookedWith("Mold Busters");
      if (!b) return;
      const mb = pro("Mold Busters");
      await rejects(mb.askForMore(b.jobId, {}), 400, "empty request");
      const d = await mb.askForMore(b.jobId, { shotIds: ["closeup_affected"], questionIds: ["smell"], message: "A bit closer please." });
      check(d.job.status === "more_info", "job is more_info");
      let s = await api.homeowner.scan(b.scanId);
      check(s.job?.request?.shotIds.join() === "closeup_affected" && s.job.request.message === "A bit closer please.", "phone sees the request");
      check((await api.homeowner.home()).record.find((r) => r.scanId === b.scanId)?.needsAction === true, "Home Record flags it");
      s = await api.homeowner.reopen(b.scanId);
      check(s.scan.status === "capturing" && s.remainingShots.join() === "closeup_affected", "only the requested shot is asked for");
      const shot = await api.homeowner.uploadShot(b.scanId, "closeup_affected", CLOSE, "closeup.png");
      check(shot.ok && shot.status === "clarifying", "rescan done → questions");
      await rejects(api.homeowner.finish(b.scanId, {}), 400, "the requested question must be answered");
      s = await api.homeowner.finish(b.scanId, { smell: "No" }, "It's dry now.");
      check(s.job?.status === "pending" && s.spec?.version === 2, "job back to pending with spec v2");
      check(s.scan.answers.smell === "No" && s.scan.focus === null && s.scan.status === "submitted", "answer updated, focus cleared");
      check(s.scan.notes?.includes("Reply to the pro: It's dry now.") ?? false, "reply appended to the notes");
      check(await inTab("Mold Busters", "new", b.jobId), "back in the pro's New tab");
      check((await mb.job(b.jobId)).spec.version === 2, "pro sees spec v2");
    });

    await flow("Decline → phone offers the next pro → rebook → all decline → virtual call", async () => {
      const b = await bookedWith("Mold Busters");
      if (!b) return;
      await pro("Mold Busters").decline(b.jobId);
      let s = await api.homeowner.scan(b.scanId);
      check(s.job?.status === "declined", "phone sees the decline");
      check(!s.matches.some((m) => m.name === "Mold Busters") && s.matches.some((m) => m.name === "ClearSpore Remediation"), "next pro offered, decliner excluded");
      await rejects(api.homeowner.book(b.scanId, byName["Mold Busters"].id), 400, "rebooking the pro who declined");
      s = await api.homeowner.book(b.scanId, byName["ClearSpore Remediation"].id);
      check(s.job?.status === "pending" && s.job.provider?.name === "ClearSpore Remediation", "rebooked with ClearSpore");
      check(s.spec?.priceLow === quote(byName["ClearSpore Remediation"].rateCard, s.spec!).low, "repriced for the new pro");
      await rejects(pro("Mold Busters").job(b.jobId), 404, "decliner no longer sees it");
      check(await inTab("ClearSpore Remediation", "new", b.jobId), "in ClearSpore's New tab");
      await pro("ClearSpore Remediation").decline(b.jobId);
      s = await api.homeowner.scan(b.scanId);
      check(s.job?.status === "declined" && s.matches.length === 0, "nobody left in range");
      s = await api.homeowner.requestVirtualCall(b.scanId);
      check(s.job?.status === "virtual_call" && s.job.mode === "virtual" && s.job.provider === null, "virtual call requested; partner already declined, so unassigned");
    });

    await flow("Human handoff → Needs review → route to a virtual call → accept → done", async () => {
      let s = await scanToSpec();
      if (s.scan.status === "spec_ready") s = await api.homeowner.askForHuman(s.scan.id);
      check(s.job?.status === "handoff" && s.job.provider?.name === "Mold Busters", "handed off to Mold Busters' review");
      const jobId = s.job.id;
      check(await inTab("Mold Busters", "review", jobId), "in the Needs review tab");
      await rejects(api.homeowner.askForHuman(s.scan.id), 409, "handing off twice");
      const d = await pro("Mold Busters").routeToVirtualCall(jobId);
      check(d.job.status === "virtual_call" && d.job.mode === "virtual", "routed to a virtual call");
      s = await api.homeowner.scan(s.scan.id);
      check(s.job?.status === "virtual_call", "phone shows the virtual call");
      await pro("Mold Busters").accept(jobId, { slot: d.slots[0].startsAt, price: d.quote.price });
      await pro("Mold Busters").setStatus(jobId, "done");
      check((await api.homeowner.scan(s.scan.id)).job?.status === "done", "virtual job can finish without en route");
    });

    if (fake) {
      await flow("Low confidence (< 0.6) hands off automatically with the spec attached", async () => {
        const s = await scanToSpec("mold", "handoff: hard to see");
        check(s.spec!.confidence < HANDOFF_CONFIDENCE, "spec confidence below 0.6");
        check(s.scan.status === "submitted" && s.job?.status === "handoff", "job went straight to handoff");
        check(s.matches.length === 0, "no booking offered");
        check(await inTab("Mold Busters", "review", s.job.id), "in the Needs review tab");
      });
    }

    await flow("No pro in range → Mold Busters virtual call", async () => {
      await api.homeowner.setHome({ address: "Far away", lat: CENTER.lat + 8, lng: CENTER.lng });
      try {
        let s = await scanToSpec();
        if (s.scan.status !== "spec_ready") return aiCheck(false, "low confidence; skipped");
        check(s.matches.length === 0 && s.spec?.priceLow === null, "no matches, no price");
        await rejects(api.homeowner.book(s.scan.id, byName["Mold Busters"].id), 400, "booking an out-of-range pro");
        s = await api.homeowner.requestVirtualCall(s.scan.id);
        check(s.job?.status === "virtual_call" && s.job.mode === "virtual" && s.job.provider?.name === "Mold Busters", "virtual call with Mold Busters");
        check(await inTab("Mold Busters", "review", s.job.id), "in Mold Busters' Needs review tab");
      } finally {
        await api.homeowner.setHome({ address: "1 Test Street", ...CENTER });
      }
    });

    await flow("Rate card edit reprices immediately; homeowner cancels", async () => {
      const b = await bookedWith("Mold Busters");
      if (!b) return;
      const mb = pro("Mold Busters");
      const original = (await mb.rateCard()).rateCard;
      try {
        await rejects(mb.saveRateCard({ base: 1, per_m2: 1, severity_multiplier: [1, 1, 1, 1] }), 400, "rate card needs 5 multipliers");
        const card = { base: 200, per_m2: 50, severity_multiplier: [1, 1, 1, 1, 1] };
        await mb.saveRateCard(card);
        const d = await mb.job(b.jobId);
        const want = quote(card, d.spec);
        check(d.quote.price === want.price, `detail quote follows the new card ($${d.quote.price})`);
        check((await mb.queue()).tabs.new.find((c) => c.jobId === b.jobId)?.quote.price === want.price, "queue card follows the new card");
      } finally {
        await mb.saveRateCard(original);
      }
      const s = await api.homeowner.cancel(b.scanId);
      check(s.scan.status === "cancelled" && s.job?.status === "cancelled", "cancelled");
      check(!(await inTab("Mold Busters", "new", b.jobId)), "gone from the pro's queue");
      await rejects(api.homeowner.book(b.scanId, byName["Mold Busters"].id), 409, "can't book a cancelled scan");
    });

    await flow("Second trade (plumbing_sink) is just a template file", async () => {
      const { id } = await api.homeowner.startScan("plumbing_sink");
      const t = (await api.homeowner.scan(id)).template;
      check(t.required_shots.length >= 3 && t.questions.some((q) => q.optional), "template loaded with an optional question");
      if (!fake) {
        // Real Claude would rightly reject wall photos as the wrong subject for a sink.
        const r = await api.homeowner.uploadShot(id, t.required_shots[0].id, WALL, "wall.png");
        aiCheck(!r.ok, `wall photo rejected for "${t.required_shots[0].prompt}"`);
        await api.homeowner.cancel(id);
        return;
      }
      await capture(id);
      const s = await api.homeowner.finish(id, answersFor(t));
      check(s.scan.status === "spec_ready", "optional question can be left blank");
      check(s.matches.map((m) => m.name).join() === "Clearwater Plumbing,Pipeline Pros", "plumbers matched, best rating first");
      const booked = await api.homeowner.book(id, byName["Clearwater Plumbing"].id);
      await rejects(pro("Mold Busters").job(booked.job!.id), 404, "mold pro can't see a plumbing job");
    });

    await flow("Access control, CORS and errors", async () => {
      const other = await api.auth.signup({ name: "E2E Other", email: `other-${email}`, password: "e2e-password" });
      userIds.push(other.user.id);
      const mine = (await api.homeowner.home()).record[0].scanId;
      const otherApi = createScopeClient({ baseUrl: BASE, getToken: () => other.token });
      await otherApi.homeowner.setHome({ address: "Next door", ...CENTER });
      await rejects(otherApi.homeowner.scan(mine), 404, "another homeowner can't open my scan");
      const provider = await api.auth.login("plumber@demo.com", "password123").catch(() => null);
      if (provider) {
        const provApi = createScopeClient({ baseUrl: BASE, getToken: () => provider.token });
        await rejects(provApi.homeowner.home(), 403, "non-customer account on homeowner routes");
      }
      check((await raw("/api/pro/queue")).status === 400, "pro route without ?provider=");
      check((await raw("/api/pro/queue?provider=99999")).status === 404, "unknown provider");
      const pre = await raw("/api/scans", { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
      check(pre.status === 204 && pre.headers.get("access-control-allow-origin") && /authorization/i.test(pre.headers.get("access-control-allow-headers") ?? ""), "CORS preflight allows bearer requests");
      const get = await raw("/api/health", { headers: { Origin: "http://localhost:5173" } });
      check(get.headers.get("access-control-allow-origin"), "CORS header on normal responses");
      const err = await raw("/api/scans/abc", { headers: { Authorization: `Bearer ${token}` } });
      check(err.status === 404 && typeof (await err.json()).error === "string", "errors are { error } JSON");
    });
  } finally {
    if (KEEP) console.log(`\nKept the test data. Sign in as ${email} / e2e-password to see it.`);
    else cleanup(userIds, snapshot);
  }

  console.log(`\n${failures ? "FAILED" : "PASSED"}: ${checks} checks, ${failures} failed flow(s)${warnings ? `, ${warnings} AI warning(s)` : ""}`);
  process.exit(failures ? 1 : 0);
}

/** Deletes the throwaway homeowners' data and restores provider ratings and rate cards. Local server only. */
function cleanup(userIds: number[], snapshot: { id: number; rating: number; ratingCount: number; rateCard: ProProvider["rateCard"] }[]) {
  if (!userIds.length) return;
  if (!/localhost|127\.0\.0\.1/.test(BASE) || !fs.existsSync(path.join(process.cwd(), "data", "molsters.db"))) {
    console.log(`\nRemote server: test data left in place (${userIds.length} test homeowner(s)).`);
    return;
  }
  // Imported here so a remote run never opens the local database.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db, schema: t } = require("../db/index") as typeof import("../db/index");
  const homeIds = db.select().from(t.homes).where(inArray(t.homes.customerId, userIds)).all().map((h) => h.id);
  const scanIds = homeIds.length ? db.select().from(t.scans).where(inArray(t.scans.homeId, homeIds)).all().map((s) => s.id) : [];
  db.transaction((tx) => {
    if (scanIds.length) {
      const jobIds = tx.select().from(t.scopeJobs).where(inArray(t.scopeJobs.scanId, scanIds)).all().map((j) => j.id);
      if (jobIds.length) tx.delete(t.ratings).where(inArray(t.ratings.jobId, jobIds)).run();
      tx.delete(t.scopeJobs).where(inArray(t.scopeJobs.scanId, scanIds)).run();
      tx.delete(t.jobSpecs).where(inArray(t.jobSpecs.scanId, scanIds)).run();
      tx.delete(t.scanPhotos).where(inArray(t.scanPhotos.scanId, scanIds)).run();
      tx.delete(t.scans).where(inArray(t.scans.id, scanIds)).run();
    }
    if (homeIds.length) tx.delete(t.homes).where(inArray(t.homes.id, homeIds)).run();
    tx.delete(t.users).where(inArray(t.users.id, userIds)).run();
    for (const p of snapshot) tx.update(t.providers).set({ rating: p.rating, ratingCount: p.ratingCount, rateCard: p.rateCard }).where(eq(t.providers.id, p.id)).run();
  });
  for (const id of scanIds) fs.rmSync(path.join(process.cwd(), "uploads", `scan-${id}`), { recursive: true, force: true });
  console.log(`\nCleaned up ${scanIds.length} test scans and restored provider ratings and rate cards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
