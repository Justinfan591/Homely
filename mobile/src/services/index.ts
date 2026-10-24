import type { ScopeApi } from "./api";
import { mockApi } from "./mock";

// Swap this for the real HTTP client once the backend exists. The UI only sees ScopeApi.
export const api: ScopeApi = mockApi;
export { ApiError } from "./api";
export { mockConfig } from "./mock";
