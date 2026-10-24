// Shared types and schemas. Safe to import from client and server code.
import { z } from "zod";

export const TRADES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "roofing",
  "handyman",
  "cleaning",
  "pest",
  "landscaping",
] as const;
export type Trade = (typeof TRADES)[number];

export const TRADE_LABELS: Record<Trade, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "Heating & cooling",
  appliance: "Appliance repair",
  roofing: "Roofing",
  handyman: "Handyman",
  cleaning: "Cleaning",
  pest: "Pest control",
  landscaping: "Landscaping",
};

const range = z.object({ min: z.number(), max: z.number() });

export const reportSchema = z.object({
  title: z.string(),
  category: z.enum(TRADES),
  summary: z.string(),
  urgency: z.enum(["emergency", "soon", "flexible"]),
  observed_issues: z.array(z.string()),
  likely_causes: z.array(z.string()),
  safety_hazards: z.array(z.string()),
  scope_of_work: z.array(z.string()),
  materials_likely: z.array(z.string()),
  est_hours: range,
  est_cost_usd: range,
  access_notes: z.string(),
  customer_answers: z.array(z.object({ question: z.string(), answer: z.string() })),
  photo_ids_referenced: z.array(z.number()),
  confidence: z.enum(["low", "medium", "high"]),
});
export type JobReport = z.infer<typeof reportSchema>;

export const photoRequestSchema = z.object({
  message: z.string(),
  shots: z.array(z.object({ label: z.string(), instructions: z.string() })),
});
export type PhotoRequest = z.infer<typeof photoRequestSchema>;

export const questionsSchema = z.object({
  message: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      type: z.enum(["choice", "text", "yes_no"]),
      options: z.array(z.string()),
    }),
  ),
});
export type QuestionSet = z.infer<typeof questionsSchema>;

// What the intake chat UI renders for each step.
export type IntakeStep =
  | { kind: "customer"; text: string; photoIds: number[] }
  | { kind: "photos"; toolUseId: string; data: PhotoRequest; done: boolean }
  | { kind: "questions"; toolUseId: string; data: QuestionSet; done: boolean }
  | { kind: "report"; toolUseId: string; data: JobReport }
  | { kind: "note"; text: string };

export const STATUS_LABELS: Record<string, string> = {
  intake: "Describing the problem",
  report_ready: "Report ready",
  open: "Finding a local pro",
  agent_review: "With a support agent",
  assigned: "Pro assigned",
  en_route: "Pro on the way",
  in_progress: "Work in progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
