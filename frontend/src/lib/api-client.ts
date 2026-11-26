export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.port === "3000"
    ? "http://localhost:8000"
    : "");

const getCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 5000;

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { skipCache?: boolean }
): Promise<T> {
  const { skipCache, ...fetchOptions } = options || {};
  const method = (fetchOptions.method || "GET").toUpperCase();
  const url = `${API_BASE}/api/v1${path}`;

  if (method === "GET" && !skipCache) {
    const cached = getCache.get(url);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data as T;
    }
  } else if (method !== "GET") {
    getCache.clear();
  }

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(fetchOptions.headers || {}),
    },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed with status ${res.status}`);
  }

  const json = (await res.json()) as T;
  if (method === "GET") {
    getCache.set(url, { data: json, ts: Date.now() });
  }
  return json;
}
