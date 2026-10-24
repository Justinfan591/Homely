"use client";
import { useFormStatus } from "react-dom";

/** A submit button that says what's happening while the server works (the profile agent takes a few seconds). */
export function SubmitButton({ children, pending, className = "btn primary" }: { children: React.ReactNode; pending: string; className?: string }) {
  const status = useFormStatus();
  return (
    <button className={className} disabled={status.pending}>
      {status.pending ? pending : children}
    </button>
  );
}
