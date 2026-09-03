/**
 * The API client. Its job is to turn every failure into a sentence someone can
 * act on, and to keep the session cookie travelling.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, deleteJson, getJson, postJson } from "./api";

const FALLBACK = "Could not reach the server.";

function stub(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("sends cookies, or the session never travels", async () => {
    const fetchMock = stub({ ok: true, status: 200, json: async () => ({}) });

    await getJson("/api/auth/me", FALLBACK);

    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
  });

  it("posts JSON with the right header", async () => {
    const fetchMock = stub({ ok: true, status: 200, json: async () => ({}) });

    await postJson("/api/drafts", { title: "x" }, FALLBACK);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ title: "x" });
  });

  it("returns the parsed body", async () => {
    stub({ ok: true, status: 200, json: async () => ({ id: 3 }) });
    await expect(getJson("/api/drafts/3", FALLBACK)).resolves.toEqual({ id: 3 });
  });

  it("does not try to parse a 204", async () => {
    // Asking a bodyless response for JSON throws, which would turn a
    // successful delete into an error.
    stub({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("no body");
      },
    });

    await expect(deleteJson("/api/drafts/3", FALLBACK)).resolves.toBeUndefined();
  });
});

describe("failures", () => {
  it("surfaces the backend's own explanation", async () => {
    stub({ ok: false, status: 409, json: async () => ({ detail: "Already taken." }) });

    await expect(getJson("/api/x", FALLBACK)).rejects.toThrow("Already taken.");
  });

  it("carries the status so callers can tell 401 from the rest", async () => {
    stub({ ok: false, status: 401, json: async () => ({ detail: "Sign in." }) });

    await expect(getJson("/api/x", FALLBACK)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("falls back when the error body is not ours", async () => {
    stub({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(getJson("/api/x", FALLBACK)).rejects.toThrow(FALLBACK);
  });

  it("falls back when the body has no detail", async () => {
    stub({ ok: false, status: 500, json: async () => ({ oops: true }) });
    await expect(getJson("/api/x", FALLBACK)).rejects.toThrow(FALLBACK);
  });

  it("reports a readable message when there is no backend at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(getJson("/api/x", FALLBACK)).rejects.toThrow(FALLBACK);
  });
});

describe("ApiError", () => {
  it("knows when it means 'sign in'", () => {
    expect(new ApiError("x", 401).isUnauthenticated).toBe(true);
    expect(new ApiError("x", 403).isUnauthenticated).toBe(false);
    expect(new ApiError("x", 0).isUnauthenticated).toBe(false);
  });
});
