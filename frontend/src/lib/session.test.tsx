import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { endSession, initials, startSession, useSession } from "./session";

const STORAGE_KEY = "prelegal.session";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("startSession / endSession", () => {
  it("stores the session so it survives a reload", () => {
    startSession({ name: "Ada Lovelace", email: "ada@acme.com" });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      name: "Ada Lovelace",
      email: "ada@acme.com",
    });
  });

  it("clears the session on sign out", () => {
    startSession({ name: "Ada Lovelace", email: "ada@acme.com" });
    endSession();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("announces a same-tab change, which the storage event does not cover", () => {
    const listener = vi.fn();
    window.addEventListener("prelegal:session-change", listener);
    startSession({ name: "Ada Lovelace", email: "ada@acme.com" });
    endSession();
    window.removeEventListener("prelegal:session-change", listener);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not throw when storage is unavailable, as in some privacy modes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    expect(() =>
      startSession({ name: "Ada Lovelace", email: "ada@acme.com" }),
    ).not.toThrow();
  });
});

/** Renders whatever `useSession` currently reports, for the hook tests below. */
function Probe() {
  const { session, hydrated } = useSession();
  return (
    <output>
      {hydrated ? "hydrated" : "pending"}:{session ? session.name : "none"}
    </output>
  );
}

describe("useSession", () => {
  it("reports no session before anyone signs in", () => {
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("hydrated:none");
  });

  it("picks up a session already in storage", () => {
    startSession({ name: "Ada Lovelace", email: "ada@acme.com" });
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("hydrated:Ada Lovelace");
  });

  it("re-renders when the session changes in this tab", () => {
    render(<Probe />);
    act(() => startSession({ name: "Ada Lovelace", email: "ada@acme.com" }));
    expect(screen.getByRole("status")).toHaveTextContent("hydrated:Ada Lovelace");

    act(() => endSession());
    expect(screen.getByRole("status")).toHaveTextContent("hydrated:none");
  });

  it("treats unparseable stored data as signed out rather than crashing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{ not json");
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("hydrated:none");
  });

  it("treats a stored value missing its fields as signed out", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: "Ada" }));
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("hydrated:none");
  });
});

describe("initials", () => {
  it("takes the first and last name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
  });

  it("skips the middle names", () => {
    expect(initials("Ada Byron King Lovelace")).toBe("AL");
  });

  it("uses a single letter for a single name", () => {
    expect(initials("Ada")).toBe("A");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(initials("   ")).toBe("?");
  });
});
