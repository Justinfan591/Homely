// Demo accounts from db/seed.ts. The live demo skips the sign-in screen and uses these.
export const DEMO_PASSWORD = "password123";

export const DEMO_ACCOUNTS = [
  { email: "customer@demo.com", label: "Casey", hint: "Homeowner" },
  { email: "mold@demo.com", label: "Mold Busters", hint: "Provider · mold" },
  { email: "plumber@demo.com", label: "Rivera Plumbing", hint: "Provider · plumbing" },
  { email: "electrician@demo.com", label: "Watts Electric", hint: "Provider · electrical" },
  { email: "hvac@demo.com", label: "Cole Heating & Air", hint: "Provider · HVAC" },
  { email: "agent@demo.com", label: "Alex", hint: "Support agent" },
] as const;

/** Who the app signs in as on first launch. */
export const DEFAULT_ACCOUNT = DEMO_ACCOUNTS[0].email;
