"use client";
import { useFormStatus } from "react-dom";

/** A submit button that says what's happening while the server works (the agents take a few seconds). */
export function SubmitButton({
  children,
  pending,
  className = "btn primary",
  disabled,
  "aria-label": label,
}: {
  children: React.ReactNode;
  pending: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const status = useFormStatus();
  return (
    <button className={className} disabled={disabled || status.pending} aria-label={label}>
      {status.pending ? pending : children}
    </button>
  );
}
