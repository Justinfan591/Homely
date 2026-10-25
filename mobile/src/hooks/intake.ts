import { router } from "expo-router";
import type { Classification, TradeId } from "@/domain/types";
import { api } from "@/services";
import { getTemplate } from "@/templates";

/**
 * What the homeowner said or showed on the "Tell us" screens, handed from one screen to the next.
 * In memory only: it's a few seconds' worth of state, and a fresh start is fine after a restart.
 */
/** Which home-screen button the homeowner used: each one is its own path to "Is this right?". */
export type IntakeSource = "type" | "voice" | "photo";

export const intake: { source: IntakeSource; text: string; photoUri: string | null; result: Classification | null } = {
  source: "voice",
  text: "",
  photoUri: null,
  result: null,
};

export function resetIntake(source: IntakeSource = intake.source) {
  intake.source = source;
  intake.text = "";
  intake.photoUri = null;
  intake.result = null;
}

/**
 * Starts the scan for the trade the homeowner confirmed (the AI's guess, an alternative, or a grid pick).
 * A photo from the camera path becomes the first guided shot, so they don't take it twice: the shot
 * the AI matched for its top guess, otherwise the trade's first shot. If the photo check rejects it,
 * the guided camera simply asks for that shot.
 */
export async function startFromIntake(homeId: string, trade: TradeId) {
  const scan = await api.createScan(homeId, trade, intake.text.trim() || null);
  const photo = intake.photoUri;
  if (photo) {
    const shotId = (intake.result?.trade === trade && intake.result.shotId) || getTemplate(trade).requiredShots[0]?.id;
    if (shotId) await api.submitPhoto(scan.id, shotId, photo).catch((e) => console.warn("Couldn't reuse the first photo", e));
  }
  resetIntake();
  // Drop the "Tell us" screens so leaving the scan returns to the tabs.
  router.dismissAll();
  router.push(`/scan/${scan.id}`);
}
