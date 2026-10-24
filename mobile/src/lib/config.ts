import Constants from "expo-constants";

const PORT = 3000;

/**
 * Where the Molsters API runs. By default this is the same computer that runs
 * `npx expo start` (Expo Go already knows its LAN address), on port 3000.
 * Set EXPO_PUBLIC_API_URL in mobile/.env to point somewhere else.
 */
function apiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:${PORT}`;
}

export const API_URL = apiUrl();
