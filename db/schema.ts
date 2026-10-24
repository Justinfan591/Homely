import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import type { JobReport } from "@/shared/types";
import type { MoreInfoRequest, RateCard } from "../shared/scope";
import { JOB_STATUSES as SCOPE_JOB_STATUSES, SCAN_STATUSES } from "../shared/scope";

const now = () => new Date();

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["customer", "provider", "agent"] }).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const providerProfiles = sqliteTable("provider_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  businessName: text("business_name"),
  trades: text("trades", { mode: "json" }).$type<string[]>().notNull().default([]),
  zips: text("zips", { mode: "json" }).$type<string[]>().notNull().default([]),
  bio: text("bio"),
  ratingAvg: real("rating_avg").notNull().default(5),
  jobsDone: integer("jobs_done").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const JOB_STATUSES = [
  "intake",
  "report_ready",
  "open",
  "agent_review",
  "assigned",
  "en_route",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: JOB_STATUSES }).notNull().default("intake"),
  address: text("address").notNull(),
  zip: text("zip").notNull(),
  initialDescription: text("initial_description"),
  report: text("report", { mode: "json" }).$type<JobReport>(),
  category: text("category"),
  urgency: text("urgency"),
  providerId: integer("provider_id").references(() => users.id),
  agentId: integer("agent_id").references(() => users.id),
  route: text("route", { enum: ["open", "agent"] }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const photos = sqliteTable("photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  uploadedBy: integer("uploaded_by")
    .notNull()
    .references(() => users.id),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  label: text("label"),
  // Whether this photo has been sent to the intake agent yet.
  sentToAgent: integer("sent_to_agent", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

// Full Claude message history for the intake chat. Append-only.
export const intakeTurns = sqliteTable("intake_turns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  seq: integer("seq").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content", { mode: "json" }).$type<unknown[]>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  senderId: integer("sender_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const jobEvents = sqliteTable("job_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorId: integer("actor_id").references(() => users.id),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export type User = typeof users.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Photo = typeof photos.$inferSelect;

// ---------------------------------------------------------------------------
// Scope: camera intake → JobSpec → deterministic price → matched pro.
// See SOON26.md. The tables above belong to the older open-board flow.
// ---------------------------------------------------------------------------

/** The homeowner's home. Its scans and jobs make up the Home Record. */
export const homes = sqliteTable("homes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .unique()
    .references(() => users.id),
  label: text("label").notNull().default("My home"),
  address: text("address").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** A provider company. The /pro dashboard picks one with ?provider=<id> (no auth). */
export const providers = sqliteTable("providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  trades: text("trades", { mode: "json" }).$type<string[]>().notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  radiusKm: real("radius_km").notNull().default(30),
  rating: real("rating").notNull().default(5),
  ratingCount: integer("rating_count").notNull().default(0),
  rateCard: text("rate_card", { mode: "json" }).$type<RateCard>().notNull(),
  phone: text("phone"),
  /** Offers virtual calls when no on-site pro is in range. */
  offersVirtual: integer("offers_virtual", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const scans = sqliteTable("scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  homeId: integer("home_id")
    .notNull()
    .references(() => homes.id),
  trade: text("trade").notNull(),
  status: text("status", { enum: SCAN_STATUSES }).notNull().default("capturing"),
  answers: text("answers", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  notes: text("notes"),
  skippedShots: text("skipped_shots", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** While answering a pro's "ask for more": only these items are asked. */
  focus: text("focus", { mode: "json" }).$type<MoreInfoRequest>(),
  /** Focus shots already retaken or skipped. */
  focusDone: text("focus_done", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Every capture attempt. The latest ok photo per shot is the one used. */
export const scanPhotos = sqliteTable("scan_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scanId: integer("scan_id")
    .notNull()
    .references(() => scans.id),
  shotId: text("shot_id").notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  ok: integer("ok", { mode: "boolean" }).notNull().default(false),
  /** Message shown to the homeowner after the check. */
  feedback: text("feedback"),
  /** What the vision check saw; fed into the spec. */
  observation: text("observation"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** A new version is written each time the spec is (re)generated. */
export const jobSpecs = sqliteTable("job_specs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scanId: integer("scan_id")
    .notNull()
    .references(() => scans.id),
  version: integer("version").notNull().default(1),
  trade: text("trade").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  fields: text("fields", { mode: "json" }).$type<Record<string, string>>().notNull(),
  severity: integer("severity").notNull(),
  areaM2: real("area_m2").notNull(),
  confidence: real("confidence").notNull(),
  /** Priced with the top-matched provider's rate card at generation time. */
  priceLow: real("price_low"),
  priceHigh: real("price_high"),
  pricedForProviderId: integer("priced_for_provider_id").references(() => providers.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** One job per scan. Table is `scope_jobs` so it doesn't clash with the older `jobs`. */
export const scopeJobs = sqliteTable("scope_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scanId: integer("scan_id")
    .notNull()
    .unique()
    .references(() => scans.id),
  specId: integer("spec_id")
    .notNull()
    .references(() => jobSpecs.id),
  providerId: integer("provider_id").references(() => providers.id),
  status: text("status", { enum: SCOPE_JOB_STATUSES }).notNull(),
  mode: text("mode", { enum: ["onsite", "virtual"] }).notNull().default("onsite"),
  slot: integer("slot", { mode: "timestamp" }),
  eta: integer("eta", { mode: "timestamp" }),
  price: real("price"),
  request: text("request", { mode: "json" }).$type<MoreInfoRequest>(),
  declinedBy: text("declined_by", { mode: "json" }).$type<number[]>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const ratings = sqliteTable("ratings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .unique()
    .references(() => scopeJobs.id),
  stars: integer("stars").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export type Home = typeof homes.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type ScanPhoto = typeof scanPhotos.$inferSelect;
export type JobSpec = typeof jobSpecs.$inferSelect;
export type ScopeJob = typeof scopeJobs.$inferSelect;
