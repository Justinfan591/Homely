// Shapes of the JSON the API returns. Shared by the server and the Expo app.
// Dates arrive as ISO strings because they go through JSON.
import type { IntakeStep, JobReport, Trade } from "./types";

export type Role = "customer" | "provider" | "agent";

export type JobStatus =
  | "intake"
  | "report_ready"
  | "open"
  | "agent_review"
  | "assigned"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled";

export type SessionUser = { id: number; name: string; email: string; role: Role };
export type AuthResponse = { token: string; user: SessionUser };

export type Job = {
  id: number;
  customerId: number;
  status: JobStatus;
  address: string;
  zip: string;
  initialDescription: string | null;
  report: JobReport | null;
  category: Trade | null;
  urgency: JobReport["urgency"] | null;
  providerId: number | null;
  agentId: number | null;
  route: "open" | "agent" | null;
  createdAt: string;
  updatedAt: string;
};

export type JobEvent = {
  id: number;
  jobId: number;
  fromStatus: string | null;
  toStatus: string;
  actorId: number | null;
  note: string | null;
  createdAt: string;
};

export type Person = { id: number; name: string; phone: string | null };

export type JobPhoto = { id: number; label: string | null; url: string };

export type ProviderSummary = Person & { businessName: string | null; rating: number | null; jobsDone: number };

export type Candidate = { id: number; name: string; businessName: string | null; rating: number; jobsDone: number };

export type JobResponse = {
  job: Job;
  photos: JobPhoto[];
  events: JobEvent[];
  customer: Person | null;
  provider: ProviderSummary | null;
  agent: Person | null;
  viewer: { id: number; role: Role };
  intake: IntakeStep[];
  candidates: Candidate[];
};

export type CustomerJobs = { jobs: Job[] };
export type ProviderBoard = { available: Job[]; mine: Job[]; profileComplete: boolean };
export type AgentQueue = { queue: Job[]; active: Job[]; done: Job[] };

export type Message = {
  id: number;
  body: string;
  createdAt: string;
  senderId: number;
  senderName: string;
  senderRole: Role;
};

export type ProviderProfileResponse = {
  profile: { businessName: string | null; trades: Trade[]; zips: string[]; bio: string | null; active: boolean } | null;
  phone: string | null;
};
