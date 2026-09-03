/**
 * The page a reset link lands on.
 *
 * The session module is stubbed: what matters here is what the page does with
 * the token in the address bar and with a refusal, not the request itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const resetPassword = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    resetPassword: (...args: unknown[]) => resetPassword(...args),
  };
});

import ResetPasswordPage from "./page";

/** The page reads the token straight off the address, so tests set one. */
function land(search: string) {
  window.history.replaceState({}, "", `/reset/${search}`);
}

beforeEach(() => {
  replace.mockReset();
  resetPassword.mockReset().mockResolvedValue(undefined);
  land("?token=a-real-looking-token");
});

describe("resetting a password", () => {
  it("asks for the new password twice", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/type it again/i)).toBeInTheDocument();
  });

  it("hides both passwords as they are typed", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText(/new password/i)).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText(/type it again/i)).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("sends the token from the address with the new password", async () => {
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "a-good-one-here");
    await userEvent.type(screen.getByLabelText(/type it again/i), "a-good-one-here");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith(
        "a-real-looking-token",
        "a-good-one-here",
      ),
    );
  });

  it("refuses two passwords that do not match, without asking the server", async () => {
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "a-good-one-here");
    await userEvent.type(screen.getByLabelText(/type it again/i), "a-different-one");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("says the link is spent when the server refuses it", async () => {
    resetPassword.mockRejectedValue(
      new Error("That reset link is no longer valid. Request a new one."),
    );
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "a-good-one-here");
    await userEvent.type(screen.getByLabelText(/type it again/i), "a-good-one-here");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i);
  });

  it("confirms afterwards, and says the other sessions are gone", async () => {
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText(/new password/i), "a-good-one-here");
    await userEvent.type(screen.getByLabelText(/type it again/i), "a-good-one-here");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/signed out/i);
    // The form is done with; offer the way on rather than leave it sitting there.
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("explains itself when the address carries no token", () => {
    land("");
    render(<ResetPasswordPage />);

    expect(screen.getByText(/link is incomplete/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("says nothing about whether the token is any good until it is used", () => {
    // Checking on arrival would make the page an oracle for guessed links.
    render(<ResetPasswordPage />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("carries the disclaimer", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });
});
