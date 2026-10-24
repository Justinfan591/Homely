import type {
  Classification,
  Home,
  Job,
  JobSpec,
  PhotoVerdict,
  Profile,
  ProfileUpdate,
  RecordItem,
  Review,
  Scan,
  Slot,
  SpecOutcome,
  TradeId,
} from "../domain/types"; // relative: scripts/e2e.ts imports this from outside the app

/** Every failure the UI needs to handle surfaces as an ApiError with a message safe to show. */
export class ApiError extends Error {
  constructor(
    message: string,
    /**
     * needs_answers: the estimate can't be made yet; send the homeowner back to the questions.
     * signed_out: the session is gone; the app shows sign-in.
     */
    readonly code: "network" | "not_found" | "rejected" | "needs_answers" | "signed_out" = "network",
  ) {
    super(message);
  }
}

/**
 * The contract between the UI and the backend.
 * The mock implementation lives in ./mock; a real client only has to implement this interface.
 */
export interface ScopeApi {
  // ---- Session ----
  /** Restores a saved session. True when signed in. */
  restoreSession(): Promise<boolean>;
  /** Sign-in step 1 (phone or email). Returns where the code "went" and how many digits it has. */
  startSignIn(contact: string): Promise<{ sentTo: string; length: number }>;
  /** Sign-in step 2. `isNew`: ask for name and home next. */
  verifyCode(contact: string, code: string): Promise<{ isNew: boolean }>;
  signOut(): Promise<void>;
  /** Called with false when the session ends (sign out, or the server rejects the token). */
  onSessionChange(fn: (signedIn: boolean) => void): () => void;

  getProfile(): Promise<Profile>;
  updateProfile(data: ProfileUpdate): Promise<Profile>;

  // ---- Intake ----
  /** A voice recording (local file uri) → its text. */
  transcribe(audioUri: string): Promise<string>;
  /** Which trade the description (and optional screening photo) is about. */
  classify(text: string, photoUri?: string | null): Promise<Classification>;

  listHomes(): Promise<Home[]>;
  /** The Home Record: scans and jobs for one home, newest first. */
  listRecord(homeId: string): Promise<RecordItem[]>;

  /** `description`: what the homeowner said on the voice screen. */
  createScan(homeId: string, trade: TradeId, description?: string | null): Promise<Scan>;
  getScan(scanId: string): Promise<Scan>;
  /** Uploads a photo; the vision check decides whether it is usable. */
  submitPhoto(scanId: string, shotId: string, uri: string): Promise<PhotoVerdict>;
  /** Marks a shot as not applicable (e.g. a wall with only one side). */
  skipShot(scanId: string, shotId: string): Promise<Scan>;
  /** "No photos, but you suspect mold?": skips every shot and keeps the description. Only for templates with `noPhotos`. */
  describeInstead(scanId: string, description: string): Promise<Scan>;
  /** "Move the dot to the leak": x and y in % of the photo. */
  markPhoto(scanId: string, shotId: string, x: number, y: number): Promise<Scan>;
  submitAnswers(scanId: string, answers: Record<string, string>, note: string): Promise<Scan>;

  /** Builds (or returns) the JobSpec, priced and matched. May hand off to a human or offer a virtual call. */
  getSpecOutcome(scanId: string): Promise<SpecOutcome>;
  getSpec(specId: string): Promise<JobSpec>;

  /** "Find pros": sends the spec to every matching pro at once. `slotStart` is the preferred time (ISO). */
  requestOffers(scanId: string, slotStart?: string): Promise<Job>;
  /** Picks one of `job.offers`: that pro is booked at that price and time. */
  acceptOffer(jobId: string, offerId: string): Promise<Job>;
  bookVirtualCall(scanId: string, slotId: string): Promise<Job>;
  listVirtualSlots(): Promise<Slot[]>;
  /** Polled by the tracking screens. */
  getJob(jobId: string): Promise<Job>;
  rateJob(jobId: string, review: Review): Promise<Job>;
  /** "I'd rather talk to a person": send the spec to human review instead of booking. */
  askForHuman(scanId: string): Promise<SpecOutcome>;
  /** Homeowner cancels before the pro has accepted. */
  cancelJob(jobId: string): Promise<Job>;
}
