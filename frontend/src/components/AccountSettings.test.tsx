/**
 * Changing a password from inside the app.
 *
 * The session module is stubbed: what is under test is the form -- which call
 * it makes, what it does with a refusal -- not the request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const changePassword = vi.fn();
let sessionState: { session: unknown; hydrated: boolean } = {
  session: { id: 1, name: "Ada Lovelace", email: "ada@acme.com" },
  hydrated: true,
};

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    useSession: () => sessionState,
    changePassword: (...args: unknown[]) => changePassword(...args),
  };
});

import { AccountSettings } from "./AccountSettings";

async function fillTheForm(current: string, next: string, again = next) {
  await userEvent.type(screen.getByLabelText(/current password/i), current);
  await userEvent.type(screen.getByLabelText(/^new password$/i), next);
  await userEvent.type(screen.getByLabelText(/type the new one again/i), again);
}

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: /change password/i }));

beforeEach(() => {
  changePassword.mockReset().mockResolvedValue(undefined);
  sessionState = {
    session: { id: 1, name: "Ada Lovelace", email: "ada@acme.com" },
    hydrated: true,
  };
});

describe("the account screen", () => {
  it("says which account is signed in", () => {
    render(<AccountSettings />);
    expect(screen.getByText(/ada@acme.com/)).toBeInTheDocument();
  });

  it("asks for the current password as well as the new one", () => {
    // The session proves somebody is signed in, not that it is the owner.
    render(<AccountSettings />);
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it("hides every password as it is typed", () => {
    render(<AccountSettings />);

    for (const label of [
      /current password/i,
      /^new password$/i,
      /type the new one again/i,
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("type", "password");
    }
  });

  it("sends both passwords", async () => {
    render(<AccountSettings />);

    await fillTheForm("the-old-one", "a-much-better-one");
    await submit();

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith("the-old-one", "a-much-better-one"),
    );
  });

  it("refuses a mismatched confirmation without asking the server", async () => {
    render(<AccountSettings />);

    await fillTheForm("the-old-one", "a-much-better-one", "something-else");
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows the server's refusal when the current password is wrong", async () => {
    changePassword.mockRejectedValue(
      new Error("That is not your current password."),
    );
    render(<AccountSettings />);

    await fillTheForm("not-the-old-one", "a-much-better-one");
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not your current password/i,
    );
  });

  it("confirms, and says the other sessions are gone", async () => {
    render(<AccountSettings />);

    await fillTheForm("the-old-one", "a-much-better-one");
    await submit();

    expect(await screen.findByRole("status")).toHaveTextContent(/signed out/i);
  });

  it("clears the fields once it has worked", async () => {
    // Leaving a password sitting in a form on a shared screen is careless.
    render(<AccountSettings />);

    await fillTheForm("the-old-one", "a-much-better-one");
    await submit();

    await screen.findByRole("status");
    expect(screen.getByLabelText(/current password/i)).toHaveValue("");
    expect(screen.getByLabelText(/^new password$/i)).toHaveValue("");
    expect(screen.getByLabelText(/type the new one again/i)).toHaveValue("");
  });

  it("keeps the fields when it failed, so nothing has to be retyped", async () => {
    changePassword.mockRejectedValue(new Error("That is not your current password."));
    render(<AccountSettings />);

    await fillTheForm("not-the-old-one", "a-much-better-one");
    await submit();

    await screen.findByRole("alert");
    expect(screen.getByLabelText(/^new password$/i)).toHaveValue("a-much-better-one");
  });

  it("warns that other sessions will end before anything is typed", async () => {
    render(<AccountSettings />);
    expect(screen.getByText(/signs out every other browser/i)).toBeInTheDocument();
  });
});
