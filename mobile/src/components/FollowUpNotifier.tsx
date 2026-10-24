import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRecord } from "@/hooks/data";
import { useHome } from "@/hooks/home";

// Show the banner even while the app is open: that's when the demo happens.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * "Homeowner's phone gets notification" (SOON26 §7, Ask for more). Expo Go can't receive remote
 * push (SDK 53+), so the app raises a local notification when it sees a new request in the
 * Home Record. It works while the app is open or was just switched away, not after iOS has
 * suspended it; the home banner covers that case.
 */
export function FollowUpNotifier() {
  const { home } = useHome();
  const record = useRecord(home?.id); // same SWR key as the home screen, so no extra polling
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.requestPermissionsAsync().catch(() => {});
    const open = (r: Notifications.NotificationResponse) => {
      const href = r.notification.request.content.data?.href;
      if (typeof href === "string") router.push(href as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !record.data) return;
    const waiting = record.data.filter((i) => i.status === "needs_info");
    // Requests already there at launch show as the home banner; only new ones notify.
    if (!seen.current) {
      seen.current = new Set(waiting.map((i) => i.id));
      return;
    }
    for (const item of waiting) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      Notifications.scheduleNotificationAsync({
        content: {
          title: `${item.followUp?.provider ?? "Your pro"} needs a bit more`,
          body: item.followUp?.message || "Tap to add the photos or answers they asked for.",
          data: { href: item.href },
        },
        trigger: null,
      }).catch(() => {});
    }
    // Answered requests can come back later (a second "ask for more").
    for (const id of seen.current) if (!waiting.some((i) => i.id === id)) seen.current.delete(id);
  }, [record.data]);

  return null;
}
