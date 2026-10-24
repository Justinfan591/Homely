import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSWRConfig } from "swr";
import { api } from "@/services";

type Session = "loading" | "signed_in" | "signed_out";

const SessionContext = createContext<Session>("loading");

/** Restores the saved sign-in on launch and follows sign-in / sign-out after that. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Session>("loading");
  const { mutate } = useSWRConfig();

  useEffect(() => {
    let live = true;
    api
      .restoreSession()
      .then((ok) => live && setState(ok ? "signed_in" : "signed_out"))
      .catch(() => live && setState("signed_out"));
    const off = api.onSessionChange((signedIn) => {
      // Drop everything cached for the previous account.
      if (!signedIn) void mutate(() => true, undefined, { revalidate: false });
      setState(signedIn ? "signed_in" : "signed_out");
    });
    return () => {
      live = false;
      off();
    };
  }, [mutate]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
