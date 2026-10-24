import type { ScopeApi } from "./api";
import { API_URL, USE_MOCK } from "./config";
import { createHttpApi } from "./http";
import { mockApi } from "./mock";
import { prepareAudio, preparePhoto } from "./photo";
import { tokenStore } from "./session";

// The real server by default; EXPO_PUBLIC_SCOPE_API=mock for UI work without a backend.
export const api: ScopeApi = USE_MOCK ? mockApi : createHttpApi({ baseUrl: API_URL, preparePhoto, prepareAudio, session: tokenStore });
export { ApiError } from "./api";
export { mockConfig } from "./mock";
export { API_URL, USE_MOCK } from "./config";
