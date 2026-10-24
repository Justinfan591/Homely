import Constants from "expo-constants";

const PORT = 3000;

/**
 * Where the Scope API runs. By default the computer running `npx expo start`
 * (Expo Go already knows its LAN address), on port 3000. Override with
 * EXPO_PUBLIC_API_URL in mobile/.env.
 */
function apiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:${PORT}`;
}

export const API_URL = apiUrl();

/** EXPO_PUBLIC_SCOPE_API=mock runs the app on the in-memory mock instead of the server. */
export const USE_MOCK = process.env.EXPO_PUBLIC_SCOPE_API === "mock";
