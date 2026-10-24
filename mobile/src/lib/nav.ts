import type { Role } from "@shared/api-types";

export function homeFor(role: Role) {
  return role === "customer" ? "/customer" : role === "provider" ? "/provider" : "/agent";
}
