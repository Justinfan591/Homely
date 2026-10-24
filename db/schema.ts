import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import type { JobReport, MoreInfoRequest } from "@/shared/types";
import type { RateCard } from "@/lib/pricing";

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
  // Null means DEFAULT_RATE_CARD.
  rateCard: text("rate_card", { mode: "json" }).$type<RateCard>(),
});

export const JOB_STATUSES = [
  "intake",
  "report_ready",
  "open",
  "agent_review",
  "more_info",
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
  // Set when a provider accepts from the /pro dashboard.
  slot: integer("slot", { mode: "timestamp" }),
  price: real("price"),
  virtualCall: integer("virtual_call", { mode: "boolean" }).notNull().default(false),
  declinedBy: text("declined_by", { mode: "json" }).$type<number[]>().notNull().default([]),
  moreInfo: text("more_info", { mode: "json" }).$type<MoreInfoRequest>(),
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
