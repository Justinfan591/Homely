import type Anthropic from "@anthropic-ai/sdk";
import { TRADES, photoRequestSchema, questionsSchema, reportSchema } from "@/shared/types";

type Tool = Anthropic.Beta.BetaTool;

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const range = {
  type: "object",
  properties: { min: { type: "number" }, max: { type: "number" } },
  required: ["min", "max"],
  additionalProperties: false,
} as const;

export const INTAKE_TOOLS: Tool[] = [
  {
    name: "request_photos",
    description: "Ask the customer for specific additional photos.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Short message to the customer explaining why you need these photos." },
        shots: {
          type: "array",
          description: "1 to 3 photos to take.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short name, e.g. 'Model plate'." },
              instructions: { type: "string", description: "Exactly where to point the camera." },
            },
            required: ["label", "instructions"],
            additionalProperties: false,
          },
        },
      },
      required: ["message", "shots"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_questions",
    description: "Ask the customer up to 4 short questions they can answer quickly.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Short lead-in message to the customer." },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Short unique id, e.g. 'q1'." },
              text: str,
              type: { type: "string", enum: ["choice", "text", "yes_no"] },
              options: { ...strList, description: "Answer options for 'choice'; empty otherwise." },
            },
            required: ["id", "text", "type", "options"],
            additionalProperties: false,
          },
        },
      },
      required: ["message", "questions"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_report",
    description: "Submit the finished job report once you understand the problem well enough.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Short message to the customer summarizing what happens next." },
        report: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short job title, e.g. 'Leaking P-trap under kitchen sink'." },
            category: { type: "string", enum: [...TRADES] },
            summary: { type: "string", description: "2-4 sentence summary for the tradesperson." },
            urgency: { type: "string", enum: ["emergency", "soon", "flexible"] },
            observed_issues: strList,
            likely_causes: strList,
            safety_hazards: strList,
            scope_of_work: strList,
            materials_likely: strList,
            est_hours: range,
            est_cost_usd: range,
            access_notes: str,
            customer_answers: {
              type: "array",
              items: {
                type: "object",
                properties: { question: str, answer: str },
                required: ["question", "answer"],
                additionalProperties: false,
              },
            },
            photo_ids_referenced: { type: "array", items: { type: "integer" } },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: [
            "title",
            "category",
            "summary",
            "urgency",
            "observed_issues",
            "likely_causes",
            "safety_hazards",
            "scope_of_work",
            "materials_likely",
            "est_hours",
            "est_cost_usd",
            "access_notes",
            "customer_answers",
            "photo_ids_referenced",
            "confidence",
          ],
          additionalProperties: false,
        },
      },
      required: ["message", "report"],
      additionalProperties: false,
    },
  },
];


/** Validates a tool call's input. Returns an error string if invalid. */
export function validateToolInput(name: string, input: unknown): string | null {
  const schema =
    name === "request_photos"
      ? photoRequestSchema
      : name === "ask_questions"
        ? questionsSchema
        : name === "submit_report"
          ? photoRequestSchema.pick({ message: true }).extend({ report: reportSchema })
          : null;
  if (!schema) return `Unknown tool "${name}".`;
  const result = schema.safeParse(input);
  return result.success ? null : `Invalid input: ${result.error.message}`;
}
