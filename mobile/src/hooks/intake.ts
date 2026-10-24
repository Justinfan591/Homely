import type { Classification } from "@/domain/types";

/**
 * What the homeowner said and showed on the "Tell us" screens, handed from one screen to the next.
 * In memory only: it's a few seconds' worth of state, and a fresh start is fine after a restart.
 */
export const intake: { text: string; photoUri: string | null; result: Classification | null } = {
  text: "",
  photoUri: null,
  result: null,
};

export function resetIntake() {
  intake.text = "";
  intake.photoUri = null;
  intake.result = null;
}
