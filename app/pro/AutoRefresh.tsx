"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Polls the server every 3 s, but not while the user is filling in a form. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.querySelector("details[open]") || document.activeElement?.closest("form")) return;
      router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
