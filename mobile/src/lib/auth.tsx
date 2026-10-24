import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { mutate } from "swr";
import type { AuthResponse, SessionUser } from "@shared/api-types";
import { api, setAuthToken, setUnauthorizedHandler } from "./api";
import { DEFAULT_ACCOUNT, DEMO_PASSWORD } from "./demo";

const TOKEN_KEY = "molsters_token";

// SecureStore isn't available on web; fall back to localStorage there.
const web = Platform.OS === "web";
const store = {
  get: async () => (web ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : SecureStore.getItemAsync(TOKEN_KEY)),
  set: async (v: string) => (web ? globalThis.localStorage?.setItem(TOKEN_KEY, v) : SecureStore.setItemAsync(TOKEN_KEY, v)),
  clear: async () => (web ? globalThis.localStorage?.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

export type SignupInput = { name: string; email: string; password: string; phone?: string; role: "customer" | "provider" };

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  signup: (input: SignupInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await store.clear().catch(() => {});
    // Drop cached data from the previous account.
    await mutate(() => true, undefined, { revalidate: false });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    (async () => {
      try {
        const saved = await store.get();
        if (saved) {
          setAuthToken(saved);
          const { user } = await api<{ user: SessionUser }>("/api/auth/me");
          setUser(user);
        } else {
          // Live demo: start signed in as the demo homeowner instead of showing a sign-in form.
          const res = await api<AuthResponse>("/api/auth/login", { body: { email: DEFAULT_ACCOUNT, password: DEMO_PASSWORD } });
          setAuthToken(res.token);
          await store.set(res.token).catch(() => {});
          setUser(res.user);
        }
      } catch {
        // Expired token or server unreachable: show the account picker.
        setAuthToken(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const finish = useCallback(async ({ token, user }: AuthResponse) => {
    setAuthToken(token);
    await store.set(token).catch(() => {});
    setUser(user);
    return user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      logout,
      login: async (email, password) => finish(await api<AuthResponse>("/api/auth/login", { body: { email, password } })),
      signup: async (input) => finish(await api<AuthResponse>("/api/auth/signup", { body: input })),
    }),
    [user, loading, logout, finish],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
