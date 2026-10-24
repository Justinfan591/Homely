import type {
  Home,
  Job,
  JobSpec,
  PhotoVerdict,
  RecordItem,
  Scan,
  Slot,
  SpecOutcome,
  TradeId,
} from "../domain/types"; // relative: scripts/e2e.ts imports this from outside the app

/** Every failure the UI needs to handle surfaces as an ApiError with a message safe to show. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: "network" | "not_found" | "rejected" = "network",
  ) {
    super(message);
  }
}

/**
 * The contract between the UI and the backend.
 * The mock implementation lives in ./mock; a real client only has to implement this interface.
 */
export interface ScopeApi {
  listHomes(): Promise<Home[]>;
  /** The Home Record: scans and jobs for one home, newest first. */
  listRecord(homeId: string): Promise<RecordItem[]>;

  createScan(homeId: string, trade: TradeId): Promise<Scan>;
  getScan(scanId: string): Promise<Scan>;
  /** Uploads a photo; the vision check decides whether it is usable. */
  submitPhoto(scanId: string, shotId: string, uri: string): Promise<PhotoVerdict>;
  /** Marks a shot as not applicable (e.g. a wall with only one side). */
  skipShot(scanId: string, shotId: string): Promise<Scan>;
  submitAnswers(scanId: string, answers: Record<string, string>, note: string): Promise<Scan>;

  /** Builds (or returns) the JobSpec, priced and matched. May hand off to a human or offer a virtual call. */
  getSpecOutcome(scanId: string): Promise<SpecOutcome>;
  getSpec(specId: string): Promise<JobSpec>;

  bookJob(scanId: string, providerId: string, slotId: string): Promise<Job>;
  bookVirtualCall(scanId: string, slotId: string): Promise<Job>;
  listVirtualSlots(): Promise<Slot[]>;
  /** Polled by the Track screen. */
  getJob(jobId: string): Promise<Job>;
  rateJob(jobId: string, stars: number): Promise<Job>;
  /** "I'd rather talk to a person": send the spec to human review instead of booking. */
  askForHuman(scanId: string): Promise<SpecOutcome>;
  /** Homeowner cancels before the pro has accepted. */
  cancelJob(jobId: string): Promise<Job>;
}
