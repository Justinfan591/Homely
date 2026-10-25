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
// and restores provider ratings, rate cards and profiles. Pass --keep to leave the data in place.
//   E2E_BASE_URL   server to test (default http://localhost:3000)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { inArray, eq } from "drizzle-orm";
import { createScopeClient, ScopeApiError, type ScopeClient } from "../shared/scope-client";
import { HANDOFF_CONFIDENCE, PROFILE_MAX_QUESTIONS, PROFILE_MIN_QUESTIONS, quote, toRateCard, type ProProfile, type ProProvider, type ProviderPricing, type Question, type ScanResponse, type Template, type WeekHours } from "../shared/scope";

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
/** For checks that need an outside service (Photon address search): warn when it's unreachable. */
function netCheck(cond: unknown, what: string) {
  checks++;
  if (!cond) {
    warnings++;
    console.log(`    ! warning (outside service): ${what}`);
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

/** First option for every required question (optional ones left blank). Takes a template or a question list. */
const answersFor = (t: Template | Question[], only?: string[]) =>
  Object.fromEntries((Array.isArray(t) ? t : t.questions).filter((q) => (only ? only.includes(q.id) : !q.optional)).map((q) => [q.id, q.options[0]]));

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
  await capture(id);
  const { questions } = await api.homeowner.questions(id);
  return api.homeowner.finish(id, answersFor(questions), notes);
}

/** A request open to every matching pro, or null if real Claude handed it off for low confidence. */
/** An open mold request. The flows below act as Mold Busters, so with real AI it's skipped if the matching agent left them out. */
async function openRequest(slot?: string) {
  const s = await scanToSpec();
  if (s.scan.status !== "spec_ready") {
    aiCheck(false, `spec ready (got ${s.scan.status})`);
    return null;
  }
  const opened = await api.homeowner.requestOffers(s.scan.id, slot);
  if (!(await inTab("Mold Busters", "new", opened.job!.id))) {
    aiCheck(false, "the matching agent invited Mold Busters; rest of this flow skipped");
    await api.homeowner.cancel(s.scan.id);
    return null;
  }
  return { scanId: s.scan.id, jobId: opened.job!.id };
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
  const profiles = localProfiles();
  const snapshot = providers.map((p) => {
    const local = profiles?.get(p.id);
    return { id: p.id, rating: p.rating, ratingCount: p.ratingCount, rateCard: local?.rateCard ?? p.rateCard, description: p.description, profile: local?.profile ?? null, pricing: local?.pricing ?? null, hours: local?.hours ?? null };
  });
  // The seed approves one pro's pricing per trade; the flows expect none until they approve one.
  const pricingBack = profiles ? clearPricing() : null;
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
      await rejects(api.homeowner.startScan("chimney_sweep"), 404, "unknown trade");
    });

    await flow("Address type-ahead; a picked suggestion's coordinates are saved as-is", async () => {
      check((await api.homeowner.searchAddresses("10")).suggestions.length === 0, "no search under 3 characters");
      const { suggestions } = await api.homeowner.searchAddresses("1000 rue Sherbrooke");
      check(Array.isArray(suggestions) && suggestions.length <= 5, "at most 5 suggestions");
      netCheck(suggestions.length > 0, "Photon finds 1000 rue Sherbrooke");
      for (const x of suggestions) check(x.address && x.line1 && Number.isFinite(x.lat) && Number.isFinite(x.lng), `suggestion is complete: ${JSON.stringify(x)}`);
      netCheck(suggestions.some((x) => /montr[eé]al/i.test(x.address)), `the Montreal one leads (near the home): ${suggestions.map((x) => x.address).join(" | ")}`);
      check(new Set(suggestions.map((x) => x.address.toLowerCase())).size === suggestions.length, "no duplicate suggestions");

      // Picked: saved where the suggestion is, not re-geocoded.
      const pick = { address: "Somewhere Picked, Test City", lat: CENTER.lat + 0.01, lng: CENTER.lng - 0.01 };
      await api.homeowner.updateProfile(pick);
      let h = (await api.homeowner.home()).home!;
      check(h.address === pick.address && h.lat === pick.lat && h.lng === pick.lng, "picked address keeps its coordinates");
      // Same address, new coordinates (e.g. "Use my current location"): still updated. Back to the test centre.
      await api.homeowner.updateProfile({ address: pick.address, ...CENTER });
      h = (await api.homeowner.home()).home!;
      check(h.lat === CENTER.lat && h.lng === CENTER.lng, "same address with new coordinates moves the home");
      check((await raw("/api/geocode/search?q=main+street")).status === 401, "search needs a signed-in homeowner");
      await api.homeowner.updateProfile({ address: "1 Test Street", ...CENTER });
    });

    await flow("Happy path: scan → retake → skip → questions → spec → request → offers → accept → en route → done → rate", async () => {
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

      // Questions: the questions agent writes them once (fake AI: the template's), and they're stored.
      const { questions } = await api.homeowner.questions(id);
      check(questions.length <= Math.max(5, s.template.questions.length), "at most 5 agent questions (or the template's list)");
      check(new Set(questions.map((q) => q.id)).size === questions.length && questions.every((q) => q.q && q.options.length >= 2), "questions have unique ids and at least 2 options");
      if (fake) check(JSON.stringify(questions.map((q) => q.id)) === JSON.stringify(s.template.questions.map((q) => q.id)), "fake AI: questions are the template's");
      const again = await api.homeowner.questions(id);
      check(JSON.stringify(again.questions) === JSON.stringify(questions), "questions are written once, then stored");
      check(JSON.stringify((await api.homeowner.scan(id)).scan.questions) === JSON.stringify(questions), "scan response carries the questions");
      if (questions.some((q) => !q.optional)) await rejects(api.homeowner.finish(id, {}), 400, "missing answers");
      if (questions.length) {
        await rejects(api.homeowner.finish(id, { ...answersFor(questions), [questions[0].id]: "x".repeat(201) }), 400, "own-words answer over 200 characters");
      }
      s = await api.homeowner.finish(id, answersFor(questions), "Behind the bathroom door.");
      if (s.scan.status !== "spec_ready") {
        aiCheck(false, `spec confidence ${s.spec?.confidence} — expected ≥ ${HANDOFF_CONFIDENCE}; rest of flow skipped`);
        return;
      }
      const spec = s.spec!;
      check(spec.version === 1 && spec.severity >= 1 && spec.severity <= 5 && spec.areaM2 >= 0, "spec v1 with severity 1-5 and an area");
      check(spec.confidence >= 0 && spec.confidence <= 1, "confidence in [0, 1]");
      // Low confidence no longer stops the flow (the homeowner still gets a price); the test photos just aren't real.
      aiCheck(spec.confidence >= HANDOFF_CONFIDENCE, `confidence ${spec.confidence} ≥ ${HANDOFF_CONFIDENCE}`);
      check(s.template.outputs.filter((k) => k !== "severity" && k !== "affected_area_m2").every((k) => typeof spec.fields[k] === "string"), "every template output field filled");
      aiCheck(spec.summary.toLowerCase().includes("testing recommended"), `summary uses the policy wording ("${spec.summary.slice(0, 80)}…")`);
      check(!/\$\d/.test(spec.summary + spec.title), "the AI text contains no prices");
      check(s.scan.notes === "Behind the bathroom door.", "note saved");

      // Matching + deterministic pricing.
      const names = s.matches.map((m) => m.name);
      // Kept for the pro-side check: the list is cleared once offers are requested.
      const quoted = s.matches;
      check(names.includes("Mold Busters") && names.includes("ClearSpore Remediation"), `in-range mold pros match (${names.join(", ")})`);
      check(!names.includes("Northshore Mold Co"), "out-of-range pro is filtered out");
      check(!names.some((n) => n.includes("Plumbing") || n.includes("Pipeline")), "other trades are filtered out");
      // Without the matching agent (fake AI) pros are ranked by rating; with it, by how well they fit.
      if (fake) check(s.matches.every((m, i) => i === 0 || s.matches[i - 1].rating >= m.rating), "ranked by rating");
      check(spec.hours != null && spec.hours > 0 && spec.partsCost != null && spec.partsCost >= 0 && !!spec.complexity, `spec estimates the work (${spec.hours} h, ${spec.complexity}, CA$${spec.partsCost} parts)`);
      if (fake) check(spec.hours === 2 && spec.partsCost === 40 && spec.complexity === "medium", "fake spec: 2 h, CA$40 parts, medium");
      for (const m of s.matches) {
        // Each pro's price = their rates × the spec's hours and parts (code, no agent).
        const card = toRateCard(byName[m.name].rateCard);
        const want = quote(card, spec);
        check(m.quote.price === want.price && m.quote.low === want.low && m.quote.high === want.high, `${m.name} quote = call-out + extra hours + parts (CA$${m.quote.price})`);
        check(m.quote.price === m.quote.callOut + m.quote.extra + m.quote.parts, `${m.name} breakdown adds up`);
        check(m.slots.length === 3 && m.slots.every((x) => new Date(x.startsAt).getTime() > Date.now()), `${m.name} offers 3 future slots`);
        check(m.etaMinutes > 0 && m.distanceKm >= 0, `${m.name} has distance and ETA`);
      }
      check(spec.priceLow === s.matches[0].quote.low && spec.priceHigh === s.matches[0].quote.high && spec.priceBasis === null, "spec range priced for the top match");

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

      // Request offers: every in-range pro sees it at once.
      await rejects(api.homeowner.rate(id, 5), 409, "rating before the job is done");
      s = await api.homeowner.requestOffers(id);
      check(s.scan.status === "submitted" && s.job?.status === "open" && s.job.provider === null, "request is open, no pro assigned yet");
      check(s.invitedCount === names.length && s.offers.length === 0 && s.passedCount === 0, `sent to all ${names.length} matched pros`);
      check(s.matches.length === 0, "no pro list once requested");
      await rejects(api.homeowner.requestOffers(id), 409, "requesting twice");
      const jobId = s.job!.id;
      let rec = (await api.homeowner.home()).record.find((r) => r.scanId === id);
      check(rec?.jobStatus === "open" && rec.offerCount === 0 && !rec.needsAction, "Home Record shows the open request");

      // Pro side: both in-range mold pros see it; others don't.
      const cs = byName["ClearSpore Remediation"];
      for (const n of ["Mold Busters", "ClearSpore Remediation"]) {
        const card = (await pro(n).queue()).tabs.new.find((c) => c.jobId === jobId);
        check(card && card.status === "open" && card.myOffer === null && card.invitedCount === names.length, `open request in ${n}'s New tab`);
      }
      await rejects(pro("Northshore Mold Co").job(jobId), 404, "out-of-range pro can't open it");
      await rejects(pro("Clearwater Plumbing").job(jobId), 404, "other trade can't open it");
      let d = await pro("Mold Busters").job(jobId);
      check(d.photos.length >= 2 && d.photos.every((p) => p.ok), "pro sees the usable photos only");
      const answered = Object.keys(answersFor(questions));
      check(d.answers.length === answered.length && answered.every((id) => d.answers.some((a) => a.id === id && a.q)), `pro sees readable answers to the questions asked (${d.answers.length})`);
      check(d.home.address !== "1 Test Street", "address hidden until the homeowner picks");
      check(d.quote.price === quoted.find((m) => m.name === "Mold Busters")?.quote.price, "pro's price = the homeowner-side quote");
      check(d.quote.callOut === toRateCard(mb.rateCard).callOut && d.quote.hours === spec.hours, "pro sees the estimate breakdown (call-out, hours)");
      check(!!d.client && !d.client.includes(" "), `pro sees only the homeowner's first name before booking ("${d.client}")`);
      const qcard = (await pro("Mold Busters").queue()).tabs.new.find((c) => c.jobId === jobId);
      check(qcard?.quote.price === d.quote.price && qcard.needsApproval === d.needsApproval, "queue card carries the same price");
      check(s.offers.length === 0, "no automatic offers without approved pricing");
      check((await raw(d.photos[0].src)).status === 200, "pro's signed photo src loads");
      await rejects(pro("Mold Busters").accept(jobId, { slot: d.slots[0].startsAt, price: d.quote.price }), 409, "can't take an open request directly");

      // Offers: any price, a valid slot.
      await rejects(pro("Mold Busters").offer(jobId, { slot: d.slots[0].startsAt, price: 0 }), 400, "offer of $0");
      await rejects(pro("Mold Busters").offer(jobId, { slot: new Date(Date.now() - 86400000).toISOString(), price: d.quote.price }), 400, "slot in the past");
      d = await pro("Mold Busters").offer(jobId, { slot: d.slots[1].startsAt, price: d.quote.price + 40 });
      check(d.myOffer?.status === "active" && d.myOffer.price === d.quote.price + 40, "Mold Busters sent an offer");
      d = await pro("Mold Busters").offer(jobId, { slot: d.slots[0].startsAt, price: d.quote.price });
      check(d.myOffer?.price === d.quote.price && d.myOffer.slot === d.slots[0].startsAt, "offer updated in place");
      const csQuote = (await pro("ClearSpore Remediation").job(jobId)).quote;
      const csPrice = csQuote.high + 500;
      await pro("ClearSpore Remediation").offer(jobId, { slot: d.slots[2].startsAt, price: csPrice });
      s = await api.homeowner.scan(id);
      check(s.offers.length === 2, "phone sees both offers");
      check(s.offers.every((o, i) => i === 0 || s.offers[i - 1].price <= o.price), "offers sorted cheapest first");
      const mbOffer = s.offers.find((o) => o.provider.id === mb.id)!;
      const csOffer = s.offers.find((o) => o.provider.id === cs.id)!;
      check(csOffer.price === csPrice, "price outside the rate-card range is allowed");
      check(mbOffer.distanceKm >= 0 && mbOffer.etaMinutes > 0, "offer has distance and ETA");
      rec = (await api.homeowner.home()).record.find((r) => r.scanId === id);
      check(rec?.offerCount === 2 && rec.needsAction && rec.bestOffer?.price === Math.min(mbOffer.price, csPrice), "Home Record flags the offers");

      // Withdraw → re-send.
      await pro("ClearSpore Remediation").withdrawOffer(jobId);
      check((await api.homeowner.scan(id)).offers.length === 1, "withdrawn offer disappears from the phone");
      await rejects(api.homeowner.acceptOffer(id, csOffer.id), 409, "accepting a withdrawn offer");
      await pro("ClearSpore Remediation").offer(jobId, { slot: d.slots[2].startsAt, price: csPrice });

      // Accept Mold Busters' offer.
      s = await api.homeowner.acceptOffer(id, mbOffer.id);
      check(s.job?.status === "accepted" && s.job.provider?.id === mb.id, "accepted: Mold Busters has the job");
      check(s.job.price === mbOffer.price && s.job.slot === mbOffer.slot && s.job.eta === s.job.slot, "phone shows the offer's price and slot");
      check(s.offers.length === 0, "no offers listed once booked");
      await rejects(api.homeowner.acceptOffer(id, csOffer.id), 409, "accepting a second offer");
      await rejects(pro("ClearSpore Remediation").job(jobId), 404, "the other pro no longer sees it");
      check(!(await inTab("ClearSpore Remediation", "new", jobId)), "gone from the other pro's queue");
      d = await pro("Mold Busters").job(jobId);
      check(d.home.address === "1 Test Street" && d.myOffer?.status === "accepted", "winner sees the address and an accepted offer");
      check((await raw(`${d.photos[0].url}?provider=${mb.id}`)).status === 200, "photo via ?provider= for the assigned pro");
      check((await raw(`${d.photos[0].url}?provider=${cs.id}`)).status === 404, "photo hidden from other pros");
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

    await flow("Ask for more on an open request → phone rescans → reopens to every pro, old offers stale", async () => {
      const b = await openRequest();
      if (!b) return;
      const mb = pro("Mold Busters");
      const cs = pro("ClearSpore Remediation");
      const slot = (await cs.job(b.jobId)).slots[0].startsAt;
      await cs.offer(b.jobId, { slot, price: 300 });
      await rejects(mb.askForMore(b.jobId, {}), 400, "empty request");
      const d = await mb.askForMore(b.jobId, { shotIds: ["closeup_affected"], questionIds: ["smell"], message: "A bit closer please." });
      check(d.job.status === "more_info" && d.job.provider === null, "job is more_info and still unassigned");
      let s = await api.homeowner.scan(b.scanId);
      check(s.job?.request?.shotIds.join() === "closeup_affected" && s.job.request.message === "A bit closer please.", "phone sees the request");
      const rec = (await api.homeowner.home()).record.find((r) => r.scanId === b.scanId);
      check(rec?.needsAction === true && rec.providerName === "Mold Busters", "Home Record flags it, naming the pro who asked");
      check(await inTab("ClearSpore Remediation", "new", b.jobId), "other pro still sees it (waiting)");
      await rejects(cs.offer(b.jobId, { slot, price: 310 }), 409, "no offers while waiting for the homeowner");
      s = await api.homeowner.reopen(b.scanId);
      check(s.scan.status === "capturing" && s.remainingShots.join() === "closeup_affected", "only the requested shot is asked for");
      const shot = await api.homeowner.uploadShot(b.scanId, "closeup_affected", CLOSE, "closeup.png");
      check(shot.ok && shot.status === "clarifying", "rescan done → questions");
      await rejects(api.homeowner.finish(b.scanId, {}), 400, "the requested question must be answered");
      s = await api.homeowner.finish(b.scanId, { smell: "No" }, "It's dry now.");
      check(s.job?.status === "open" && s.spec?.version === 2, "request open again with spec v2");
      check(s.scan.answers.smell === "No" && s.scan.focus === null && s.scan.status === "submitted", "answer updated, focus cleared");
      check(s.scan.notes?.includes("Reply to the pro: It's dry now.") ?? false, "reply appended to the notes");
      check(s.offers.length === 0, "old offers no longer shown");
      check((await cs.job(b.jobId)).myOffer?.status === "stale", "the other pro's offer is marked stale");
      check((await mb.job(b.jobId)).spec.version === 2, "pros see spec v2");
      await cs.offer(b.jobId, { slot, price: 320 });
      check((await api.homeowner.scan(b.scanId)).offers[0]?.price === 320, "re-sent offer shows up");
    });

    await flow("Pass → request stays open for others → everyone passes → virtual call", async () => {
      const b = await openRequest();
      if (!b) return;
      const slot = (await pro("Mold Busters").job(b.jobId)).slots[0].startsAt;
      await pro("Mold Busters").offer(b.jobId, { slot, price: 400 });
      const passed = await pro("Mold Busters").decline(b.jobId);
      check("passed" in passed && passed.passed, "pass returns { passed: true }");
      let s = await api.homeowner.scan(b.scanId);
      check(s.job?.status === "open" && s.passedCount === 1 && s.offers.length === 0, "still open; passing withdrew the offer");
      await rejects(pro("Mold Busters").job(b.jobId), 404, "the pro who passed no longer sees it");
      check(await inTab("ClearSpore Remediation", "new", b.jobId), "still in ClearSpore's New tab");
      await pro("ClearSpore Remediation").decline(b.jobId);
      s = await api.homeowner.scan(b.scanId);
      check(s.job?.status === "open" && s.passedCount === s.invitedCount, "everyone passed");
      s = await api.homeowner.requestVirtualCall(b.scanId);
      check(s.job?.status === "virtual_call" && s.job.mode === "virtual" && s.job.provider === null, "virtual call requested; partner already passed, so unassigned");
    });

    await flow("Human handoff → Needs review → route to a virtual call → accept → done", async () => {
      let s = await scanToSpec();
      if (s.scan.status === "spec_ready") s = await api.homeowner.askForHuman(s.scan.id);
      // The top-matched pro reviews it (which pro depends on the matching agent with real AI).
      const reviewer = s.job?.provider?.name ?? "";
      check(s.job?.status === "handoff" && ["Mold Busters", "ClearSpore Remediation", "Justin Fan"].includes(reviewer), `handed off to an in-range mold pro's review (${reviewer})`);
      aiCheck(reviewer === "Mold Busters", "Mold Busters reviews it");
      const jobId = s.job!.id;
      check(await inTab(reviewer, "review", jobId), "in the Needs review tab");
      await rejects(api.homeowner.askForHuman(s.scan.id), 409, "handing off twice");
      // Routing hands it to the trade's virtual-call partner (Mold Busters), whoever reviewed it.
      const d = await pro(reviewer).routeToVirtualCall(jobId);
      check(d.job.status === "virtual_call" && d.job.mode === "virtual" && d.job.provider?.name === "Mold Busters", "routed to Mold Busters' virtual call");
      s = await api.homeowner.scan(s.scan.id);
      check(s.job?.status === "virtual_call", "phone shows the virtual call");
      await pro("Mold Busters").accept(jobId, { slot: d.slots[0].startsAt, price: d.quote.price });
      await pro("Mold Busters").setStatus(jobId, "done");
      check((await api.homeowner.scan(s.scan.id)).job?.status === "done", "virtual job can finish without en route");
    });

    if (fake) {
      await flow("Low confidence (< 0.6) still gets a price and pros (no automatic handoff)", async () => {
        const s = await scanToSpec("mold", "handoff: hard to see");
        check(s.spec!.confidence < HANDOFF_CONFIDENCE, "spec confidence below 0.6");
        check(s.scan.status === "spec_ready" && !s.job, "no automatic handoff: the homeowner can book");
        check(s.matches.length > 0, "pros are offered");
        check(s.spec!.priceLow != null && s.spec!.priceHigh != null && s.spec!.priceLow <= s.spec!.priceHigh, "a price is shown");
        check(s.spec!.hours != null && s.spec!.partsCost != null, "the estimate is there even when unsure");
      });
    }

    await flow("No pro in range → Mold Busters virtual call", async () => {
      await api.homeowner.setHome({ address: "Far away", lat: CENTER.lat + 8, lng: CENTER.lng });
      try {
        let s = await scanToSpec();
        if (s.scan.status !== "spec_ready") return aiCheck(false, "low confidence; skipped");
        check(s.matches.length === 0, "no matches");
        const sp = s.spec!;
        check(sp.priceLow != null && sp.priceHigh != null && sp.priceLow >= 50 && sp.priceLow <= sp.priceHigh && !!sp.priceBasis, `best-guess estimate with a basis ($${sp.priceLow}-$${sp.priceHigh}: ${sp.priceBasis})`);
        await rejects(api.homeowner.requestOffers(s.scan.id), 409, "requesting offers with nobody in range");
        s = await api.homeowner.requestVirtualCall(s.scan.id);
        check(s.job?.status === "virtual_call" && s.job.mode === "virtual" && s.job.provider?.name === "Mold Busters", "virtual call with Mold Busters");
        check(await inTab("Mold Busters", "review", s.job.id), "in Mold Busters' Needs review tab");
      } finally {
        await api.homeowner.setHome({ address: "1 Test Street", ...CENTER });
      }
    });

    await flow("Profile interview, then pricing chat → approve → reprices and sends offers itself; homeowner cancels", async () => {
      const b = await openRequest();
      if (!b) return;
      const mb = pro("Mold Busters");
      const { website: originalSite } = await mb.profile();
      try {
        await rejects(mb.profileAction({ action: "website", url: "localhost:3000" }), 400, "local website address rejected");
        const w = await mb.profileAction({ action: "website", url: "example.com" });
        check(w.website === "https://example.com/", "website saved with https://");
        let v = await mb.profileAction({ action: "start" });
        check(v.status === "in_progress" && v.profile?.stage === "interview" && v.profile.pending, "interview starts with a question");
        check(!(await mb.queue()).provider.profileFacts, "no profile facts until finished");
        await rejects(mb.profileAction({ action: "answer", answer: ["not an option"] }), 400, "answer must be one of the options");
        await rejects(mb.profileAction({ action: "answer", answer: [] }), 400, "empty answer (use skip)");
        let asked = 0;
        while (v.profile?.stage === "interview" && asked <= PROFILE_MAX_QUESTIONS) {
          const q = v.profile.pending;
          check(q && q.options.length >= 2, `question ${asked + 1} has options`);
          v = asked === 1 ? await mb.profileAction({ action: "skip" }) : await mb.profileAction({ action: "answer", answer: [q.options[0]], note: asked === 0 ? "Attics too" : null });
          asked++;
        }
        check(v.profile?.stage === "complete", `questions end with a complete profile (${asked} asked)`);
        check(asked >= PROFILE_MIN_QUESTIONS && asked <= PROFILE_MAX_QUESTIONS, `between ${PROFILE_MIN_QUESTIONS} and ${PROFILE_MAX_QUESTIONS} questions`);
        if (fake) check(asked === 4, "fake AI asks 4 questions");
        check(v.profile.turns[0].note === "Attics too" && v.profile.turns[1].answer.length === 0, "answers, notes and skips are kept");
        check(v.profile.facts && v.profile.facts.specialties.length > 0 && v.profile.draftDescription, "agent wrote facts and a summary");
        check(v.status === "complete" && v.description === v.profile?.draftDescription, "profile complete; summary saved for matching");
        check((await mb.queue()).provider.profileFacts?.specialties.length, "queue reports the profile facts");

        // Pricing chat: the pro says how they charge; the agent drafts the rates; approve makes them live.
        let pr: ProviderPricing = await mb.pricing();
        check(pr.status === "draft" && pr.messages[0]?.who === "agent" && pr.asks.length > 0, "pricing chat opens with the agent's question and draft asks");
        await rejects(mb.pricingMessage(""), 400, "empty message");
        pr = await mb.pricingMessage("CA$200 call-out with the first hour, then CA$100 an hour. Parts at cost plus 20%. Up to CA$900 without asking me.");
        check(pr.messages.length === 3 && pr.messages.at(-1)?.who === "agent", "agent replied");
        aiCheck(pr.draft.callOut === 200 && pr.draft.hourly === 100 && pr.draft.partsMarkupPct === 20 && pr.draft.approveOver === 900, `draft rates parsed (${JSON.stringify(pr.draft)})`);
        check((await mb.job(b.jobId)).quote.callOut === toRateCard(byName["Mold Busters"].rateCard).callOut, "the draft isn't used until approved");
        pr = await mb.approvePricing();
        check(pr.status === "live" && !!pr.approvedAt, "approved: pricing is live");
        const card = toRateCard((await mb.queue()).provider.rateCard);
        check(JSON.stringify(card) === JSON.stringify(pr.draft), "approved draft is now the rate card");
        const d = await mb.job(b.jobId);
        check(d.quote.price === quote(card, d.spec).price && d.quote.callOut === card.callOut, `detail quote follows the new rates (CA$${d.quote.price})`);
        check((await mb.queue()).tabs.new.find((c) => c.jobId === b.jobId)?.quote.price === d.quote.price, "queue card matches the detail price");

        // Working hours: offers only fall inside them.
        const mornings: WeekHours = Array.from({ length: 7 }, (_, i) => Array.from({ length: 48 }, (_, j) => i < 6 && j >= 18 && j < 24));
        const h = await mb.setHours(mornings);
        check(h.hours[0][18] === true && h.hours[0][30] === false, "working hours saved");
        await rejects(mb.setHours([[true]] as WeekHours), 400, "malformed hours rejected");

        // The agent sends offers itself on new requests under the limit, inside working hours.
        const c = await openRequest();
        if (c) {
          const offer = (await api.homeowner.scan(c.scanId)).offers.find((o) => o.provider.name === "Mold Busters");
          const q = (await mb.job(c.jobId)).quote;
          check(!!offer && offer.byAgent && offer.price === q.price, `agent sent Mold Busters' offer at the quote (CA$${offer?.price})`);
          const at = offer ? new Date(offer.slot) : null;
          check(!!at && at.getHours() >= 9 && at.getHours() < 12 && at.getDay() !== 0, `agent's offer is inside working hours (${at?.toString()})`);
          check(!(await api.homeowner.scan(c.scanId)).offers.some((o) => o.provider.name === "ClearSpore Remediation"), "pros without approved pricing don't get automatic offers");
          await api.homeowner.cancel(c.scanId);
        }
        // The homeowner's preferred time: used when the pro is free then, else their next free time after it.
        const day = (n: number, hour: number) => {
          const d = new Date();
          d.setDate(d.getDate() + n);
          if (d.getDay() === 0) d.setDate(d.getDate() + 1);
          d.setHours(hour, 0, 0, 0);
          return d;
        };
        const inHours = day(3, 9);
        const f = await openRequest(inHours.toISOString());
        if (f) {
          const at = new Date((await api.homeowner.scan(f.scanId)).offers.find((o) => o.provider.name === "Mold Busters")?.slot ?? 0);
          aiCheck(at.getTime() === inHours.getTime(), `agent's offer is at the homeowner's time when the pro is free (${at.toString()})`);
          await api.homeowner.cancel(f.scanId);
        }
        const afterHours = day(2, 14);
        const g = await openRequest(afterHours.toISOString());
        if (g) {
          const at = new Date((await api.homeowner.scan(g.scanId)).offers.find((o) => o.provider.name === "Mold Busters")?.slot ?? 0);
          check(at.getTime() >= afterHours.getTime(), `outside working hours: the offer is after the homeowner's time, not before it (${at.toString()})`);
          aiCheck(at.getHours() === 9 && at.getTime() - afterHours.getTime() < 2 * 24 * 3600_000, `…at the start of the pro's next morning (${at.toString()})`);
          await api.homeowner.cancel(g.scanId);
        }
        // Over the limit: the agent leaves it to the pro.
        await mb.pricingMessage("Send me anything over CA$50.");
        pr = await mb.approvePricing();
        aiCheck(pr.draft.approveOver === 50, `limit lowered to CA$50 (${pr.draft.approveOver})`);
        const e = await openRequest();
        if (e && pr.draft.approveOver === 50) {
          check(!(await api.homeowner.scan(e.scanId)).offers.some((o) => o.provider.name === "Mold Busters"), "over the limit: no automatic offer");
          check((await mb.queue()).tabs.new.find((x) => x.jobId === e.jobId)?.needsApproval === true, "queue flags it as over the limit");
        }
        if (e) await api.homeowner.cancel(e.scanId);
      } finally {
        // Exact rate card, pricing, hours and profile come back in cleanup() (local server).
        await mb.profileAction({ action: "website", url: originalSite ?? "" }).catch(() => {});
      }
      const cs = pro("ClearSpore Remediation");
      await cs.offer(b.jobId, { slot: (await cs.job(b.jobId)).slots[0].startsAt, price: 250 });
      const s = await api.homeowner.cancel(b.scanId);
      check(s.scan.status === "cancelled" && s.job?.status === "cancelled" && s.offers.length === 0, "cancelled");
      check(!(await inTab("Mold Busters", "new", b.jobId)), "gone from the pro's queue");
      await rejects(cs.offer(b.jobId, { slot: new Date(Date.now() + 86400000).toISOString(), price: 250 }), 404, "no offers on a cancelled request");
      await rejects(api.homeowner.requestOffers(b.scanId), 409, "can't request a cancelled scan");
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
      const opened = await api.homeowner.requestOffers(id);
      check(opened.invitedCount === 2 && (await inTab("Pipeline Pros", "new", opened.job!.id)), "both plumbers get the request");
      await rejects(pro("Mold Busters").job(opened.job!.id), 404, "mold pro can't see a plumbing job");
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
    pricingBack?.();
    if (KEEP) console.log(`\nKept the test data. Sign in as ${email} / e2e-password to see it.`);
    else cleanup(userIds, snapshot);
  }

  console.log(`\n${failures ? "FAILED" : "PASSED"}: ${checks} checks, ${failures} failed flow(s)${warnings ? `, ${warnings} AI warning(s)` : ""}`);
  process.exit(failures ? 1 : 0);
}

/** Deletes the throwaway homeowners' data and restores provider ratings, rate cards and profiles. Local server only. */
type ProviderSnapshot = { id: number; rating: number; ratingCount: number; rateCard: ProProvider["rateCard"]; description: string | null; profile: ProProfile | null; pricing: ProviderPricing | null; hours: WeekHours | null };

const isLocal = () => /localhost|127\.0\.0\.1/.test(BASE) && fs.existsSync(path.join(process.cwd(), "data", "molsters.db"));

/** Providers' profile interviews straight from the local database (the API only shows the facts), or null for a remote server. */
function localProfiles() {
  if (!isLocal()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db, schema: t } = require("../db/index") as typeof import("../db/index");
  return new Map(db.select().from(t.providers).all().map((p) => [p.id, { profile: p.profile, pricing: p.pricing, hours: p.hours, rateCard: p.rateCard }]));
}

/** Clears every provider's pricing in the local database; returns what puts it back. */
function clearPricing() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db, schema: t } = require("../db/index") as typeof import("../db/index");
  const before = db.select().from(t.providers).all();
  db.update(t.providers).set({ pricing: null }).run();
  return () => {
    for (const p of before) db.update(t.providers).set({ pricing: p.pricing }).where(eq(t.providers.id, p.id)).run();
  };
}

function cleanup(userIds: number[], snapshot: ProviderSnapshot[]) {
  if (!userIds.length) return;
  if (!isLocal()) {
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
      if (jobIds.length) tx.delete(t.offers).where(inArray(t.offers.jobId, jobIds)).run();
      tx.delete(t.scopeJobs).where(inArray(t.scopeJobs.scanId, scanIds)).run();
      tx.delete(t.jobSpecs).where(inArray(t.jobSpecs.scanId, scanIds)).run();
      tx.delete(t.scanPhotos).where(inArray(t.scanPhotos.scanId, scanIds)).run();
      tx.delete(t.scans).where(inArray(t.scans.id, scanIds)).run();
    }
    if (homeIds.length) tx.delete(t.homes).where(inArray(t.homes.id, homeIds)).run();
    tx.delete(t.users).where(inArray(t.users.id, userIds)).run();
    for (const p of snapshot) tx.update(t.providers).set({ rating: p.rating, ratingCount: p.ratingCount, rateCard: p.rateCard, description: p.description, profile: p.profile, pricing: p.pricing, hours: p.hours }).where(eq(t.providers.id, p.id)).run();
  });
  for (const id of scanIds) fs.rmSync(path.join(process.cwd(), "uploads", `scan-${id}`), { recursive: true, force: true });
  console.log(`\nCleaned up ${scanIds.length} test scans and restored provider ratings, rates, pricing chats, hours and profiles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
