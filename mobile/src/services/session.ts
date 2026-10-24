import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { TokenStore } from "./http";

const KEY = "scope.session";

/** The sign-in token: Keychain / Keystore on the phone, localStorage on web (SecureStore has no web version). */
export const tokenStore: TokenStore = {
  async get() {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(KEY) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(KEY);
  },
  async set(token) {
    if (Platform.OS === "web") {
      try {
        if (token) globalThis.localStorage?.setItem(KEY, token);
        else globalThis.localStorage?.removeItem(KEY);
      } catch {
        // Private mode: the session lasts until the tab closes.
      }
      return;
    }
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  },
};
