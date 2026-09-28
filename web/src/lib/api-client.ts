/** Thin typed fetch against the portal API. Pure: no Next.js imports, unit tested. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
    public errors?: Record<string, string[]>,
  ) {
    super(detail ? `${title}: ${detail}` : title);
  }
}

export async function apiRequest<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (res.ok) {
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }
  const problem = await res.json().catch(() => ({}));
  throw new ApiError(
    res.status,
    problem.title ?? res.statusText,
    problem.detail,
    problem.errors,
  );
}
