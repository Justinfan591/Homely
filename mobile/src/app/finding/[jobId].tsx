import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { ArtOrbit, ProgressBar } from "@/components/Design";
import { goHome, Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useJob } from "@/hooks/data";
import { api } from "@/services";

/**
 * Finding pros · loading. The request went to every matching pro at once; this waits for the first
 * quote, then shows them all. Closing keeps the request open (Home shows it); Cancel withdraws it.
 */
export default function Finding() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { data: job } = useJob(jobId);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offers = job?.offers?.length ?? 0;
  const invited = job?.invitedCount ?? 0;
  const nobodyLeft = job?.status === "collecting" && !offers && invited > 0 && (job.passedCount ?? 0) >= invited;

  useEffect(() => {
    if (!job) return;
    if (nobodyLeft) router.replace(`/track/${jobId}`);
    else if (job.status !== "collecting") router.replace(`/booking/${jobId}`);
    else if (offers > 0) {
      // A short beat so the first quote doesn't feel like a glitch.
      const t = setTimeout(() => router.replace(`/quotes/${jobId}`), 1200);
      return () => clearTimeout(t);
    }
  }, [job, offers, nobodyLeft, jobId]);

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await api.cancelJob(jobId);
      goHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel. Try again.");
      setCancelling(false);
    }
  }

  return (
    <Screen close onBack={goHome} scroll={false}>
      <View style={{ flex: 1 }}>
        <ArtOrbit />
      </View>
      <Text variant="display" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ marginBottom: 12 }}>
        {offers ? "Quotes are in." : "Finding pros near you."}
      </Text>
      <Text tone="soft" style={{ marginBottom: 24 }}>
        {invited ? `Asked ${invited} ${invited === 1 ? "pro" : "pros"} nearby. ` : ""}We'll let you know when quotes come in.
      </Text>
      <ProgressBar done={offers > 0} />
      {error ? (
        <Text variant="caption" tone="danger" style={{ textAlign: "center", marginTop: 16 }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={cancel}
        disabled={cancelling}
        hitSlop={12}
        style={({ pressed }) => [{ alignSelf: "center", marginTop: 24, marginBottom: 40 }, (pressed || cancelling) && { opacity: 0.5 }]}
      >
        <Text tone="soft" style={{ fontSize: 16 }}>
          {cancelling ? "Cancelling…" : "Cancel request"}
        </Text>
      </Pressable>
    </Screen>
  );
}
