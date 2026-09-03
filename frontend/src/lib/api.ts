/**
 * Talking to the backend.
 *
 * Every request is same-origin because FastAPI serves this app, which is also
 * what lets the session cookie ride along without the frontend ever holding a
 * token. That means the API only exists when the full stack is running
 * (`scripts/start-*`); `npm run dev` on its own has no `/api` to call.
 */

/** Thrown with a message already written for someone to read on screen. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** Whether this means "sign in first" rather than "something went wrong". */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

/** 0 stands for "the request never reached a server", which has no status. */
const NO_RESPONSE = 0;

async function detailFrom(response: Response, fallback: string): Promise<string> {
  // The backend writes `detail` for a person to read; anything else means we
  // are talking to something that is not our API.
  return response
    .json()
    .then((body: { detail?: unknown }) =>
      typeof body.detail === "string" ? body.detail : fallback,
    )
    .catch(() => fallback);
}

export async function request<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      // The session cookie is httpOnly, so this is the only way it travels.
      // Same-origin is the default, but saying so keeps it true if the app is
      // ever served from somewhere else.
      credentials: "same-origin",
      ...init,
    });
  } catch {
    // Offline, or no backend at all -- `fetch` rejects rather than returning.
    throw new ApiError(fallback, NO_RESPONSE);
  }

  if (!response.ok) {
    throw new ApiError(await detailFrom(response, fallback), response.status);
  }

  // 204 has no body to parse, and asking for one throws.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function getJson<T>(path: string, fallback: string): Promise<T> {
  return request<T>(path, { method: "GET" }, fallback);
}

export function postJson<T>(
  path: string,
  body: unknown,
  fallback: string,
): Promise<T> {
  return request<T>(
    path,
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) },
    fallback,
  );
}

export function deleteJson<T>(path: string, fallback: string): Promise<T> {
  return request<T>(path, { method: "DELETE" }, fallback);
}
