import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Home } from "@/domain/types";
import { useHomes } from "./data";

type Ctx = { home: Home | undefined; homes: Home[]; select: (id: string) => void };

const HomeContext = createContext<Ctx>({ home: undefined, homes: [], select: () => {} });

/** The property the user is currently looking at. Everything in the Home Record is scoped to it. */
export function HomeProvider({ children }: { children: ReactNode }) {
  const { data } = useHomes();
  const [id, setId] = useState<string>();
  const value = useMemo<Ctx>(() => {
    const homes = data ?? [];
    return { home: homes.find((h) => h.id === id) ?? homes[0], homes, select: setId };
  }, [data, id]);
  return <HomeContext.Provider value={value}>{children}</HomeContext.Provider>;
}

export const useHome = () => useContext(HomeContext);
