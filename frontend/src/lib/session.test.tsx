/**
 * The signed-in session.
 *
 * What matters here is that the session is whatever the *server* says it is:
 * nothing is stored locally, a 401 means signed out rather than broken, and
 * signing out clears the app's idea of the user even when the request fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  forgetSession,
  initials,
  isSessionExpired,
  resetSessionForTests,
  signIn,
  signOut,
  signUp,
  useSession,
} from "./session";
import { ApiError } from "./api";

const ADA = { id: 1, name: "Ada Lovelace", email: "ada@acme.com" };

function ok(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body };
}

function fail(status: number, detail: string) {
  return { ok: false, status, json: async () => ({ detail }) };
}

/** Renders whatever `useSession` currently reports. */
function Probe() {
  const { session, hydrated } = useSession();
  return (
    <div>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="who">{session ? session.email : "nobody"}</span>
    </div>
  );
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSession", () => {
  it("asks the backend who is signed in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(ADA));
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);

    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("ada@acme.com"),
    );
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me");
  });

  it("reports signed out when the cookie belongs to nobody", async () => {
    // 401 is the ordinary answer for a visitor, not a failure.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fail(401, "Sign in to continue.")));

    render(<Probe />);

    await waitFor(() =>
      expect(screen.getByTestId("hydrated")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("who")).toHaveTextContent("nobody");
  });

  it("reports signed out when the backend cannot be reached at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    render(<Probe />);

    await waitFor(() =>
      expect(screen.getByTestId("hydrated")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("who")).toHaveTextContent("nobody");
  });

  it("is not hydrated until the answer arrives", () => {
    // Guards must wait for this, or a signed-in user is bounced to the sign-in
    // screen on every page load.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<Probe />);

    expect(screen.getByTestId("hydrated")).toHaveTextContent("false");
  });

  it("asks only once however many components are listening", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(ADA));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <Probe />
        <Probe />
        <Probe />
      </>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("signUp", () => {
  it("posts the registration and adopts the account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(ADA, 201));
    vi.stubGlobal("fetch", fetchMock);

    const account = await signUp({
      name: "Ada Lovelace",
      email: "ada@acme.com",
      password: "correct-horse",
    });

    expect(account).toEqual(ADA);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/signup");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).password).toBe("correct-horse");
  });

  it("surfaces the backend's explanation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fail(409, "That email already has an account.")),
    );

    await expect(
      signUp({ name: "A", email: "ada@acme.com", password: "correct-horse" }),
    ).rejects.toThrow("That email already has an account.");
  });
});

describe("signIn", () => {
  it("posts the credentials and adopts the account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(ADA));
    vi.stubGlobal("fetch", fetchMock);

    await signIn({ email: "ada@acme.com", password: "correct-horse" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/login");
  });

  it("sends the cookie along with the request", async () => {
    // The session is an httpOnly cookie; without credentials it never travels.
    const fetchMock = vi.fn().mockResolvedValue(ok(ADA));
    vi.stubGlobal("fetch", fetchMock);

    await signIn({ email: "ada@acme.com", password: "correct-horse" });

    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
  });

  it("passes the backend's refusal through unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fail(401, "Email or password is incorrect.")),
    );

    await expect(
      signIn({ email: "ada@acme.com", password: "wrong" }),
    ).rejects.toThrow("Email or password is incorrect.");
  });
});

describe("signOut", () => {
  it("tells the backend, then forgets the user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(ADA))
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("ada@acme.com"),
    );

    await signOut();

    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/logout");
    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("nobody"),
    );
  });

  it("forgets the user even if the request fails", async () => {
    // They asked to be signed out. Leaving them looking signed in because the
    // network blinked is the wrong way to be wrong.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(ADA))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("ada@acme.com"),
    );

    await signOut();

    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("nobody"),
    );
  });
});

describe("forgetSession", () => {
  it("drops a session the server has stopped accepting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(ADA)));

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("ada@acme.com"),
    );

    forgetSession();

    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("nobody"),
    );
  });
});

describe("isSessionExpired", () => {
  it("recognises a 401", () => {
    expect(isSessionExpired(new ApiError("nope", 401))).toBe(true);
  });

  it.each([
    ["a server error", new ApiError("boom", 500)],
    ["an unreachable backend", new ApiError("offline", 0)],
    ["an ordinary error", new Error("boom")],
  ])("does not mistake %s for a lost session", (_label, error) => {
    expect(isSessionExpired(error)).toBe(false);
  });
});

describe("initials", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["Ada", "A"],
    ["  Ada   Byron  King  ", "AK"],
    ["", "?"],
  ])("turns %o into %o", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("the session is never kept in this browser", () => {
  it("writes nothing to localStorage", async () => {
    // The whole point of the httpOnly cookie is that no script holds the
    // token -- including this one.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(ADA)));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("ada@acme.com"),
    );
    await signIn({ email: "ada@acme.com", password: "correct-horse" });

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("a component reacting to sign-in", () => {
  it("re-renders when the session changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(ADA)));

    function Screen() {
      const { session } = useSession();
      return (
        <button type="button" onClick={() => void signIn({ email: "a", password: "b" })}>
          {session ? session.name : "Sign in"}
        </button>
      );
    }

    resetSessionForTests();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(fail(401, "Sign in to continue."))
        .mockResolvedValue(ok(ADA)),
    );

    render(<Screen />);
    await screen.findByRole("button", { name: "Sign in" });

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("Ada Lovelace"),
    );
  });
});
