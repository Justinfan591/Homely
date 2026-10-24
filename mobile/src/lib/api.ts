import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(value: string | null) {
  token = value;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : `${API_URL}${path}`);

/** Headers for loading protected files such as job photos. */
export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export async function api<T = { ok: true }>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json", ...authHeaders() };
  if (opts.body && !isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(absoluteUrl(path), {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers,
      body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
    });
  } catch {
    throw new ApiError(`Can't reach the Molsters server at ${API_URL}. Is it running, and is your phone on the same Wi-Fi?`, 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    const issue = data.issues?.[0]?.message;
    throw new ApiError(issue || data.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);
